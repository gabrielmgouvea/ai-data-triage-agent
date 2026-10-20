"""
PulseTriage — Cliente Strava (OAuth 2.0 + Activities/Streams API) e adaptador de telemetria.

O backend é *stateless*: os tokens vivem no cliente e chegam aqui via header
`Authorization: Bearer <access_token>`. Este módulo só fala com o Strava e
normaliza os dados para os modelos internos (TelemetryPoint / ActivityMeta).
"""
from __future__ import annotations

import asyncio
import logging
import secrets
from typing import Any, Literal, Optional
from urllib.parse import urlencode

import httpx

from app.config import get_settings
from app.database import (
    get_cached_activity,
    get_cached_diagnostic,
    save_cached_activity,
    save_cached_diagnostic,
)
from app.models import (
    ActivityMeta,
    CompareResponse,
    ComparisonDeltas,
    ComparisonReport,
    DeterministicTriageResult,
    StravaActivityResponse,
    StravaActivitySummary,
    StravaAthlete,
    StravaTokenResponse,
    TelemetryPoint,
)
from app.services.gemini import run_gemini_comparison
from app.services.triage import compute_comparison_deltas, run_deterministic_triage

logger = logging.getLogger(__name__)

_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
_TOKEN_URL = "https://www.strava.com/oauth/token"
_API_BASE = "https://www.strava.com/api/v3"

_SCOPE = "read,activity:read_all"
_STREAM_KEYS = "time,heartrate,cadence,watts,velocity_smooth,altitude"

# Quantas atividades recentes inspecionar para achar a última COM frequência cardíaca
_RECENT_ACTIVITIES_LOOKUP = 10

# Teto de pontos devolvidos ao frontend (gráfico + payload do /analyze).
# Treinos longos (ex.: 3h = 10.800 pts) são reamostrados por passo fixo.
_MAX_TELEMETRY_POINTS = 6000

_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class StravaError(Exception):
    """Erro de integração com o Strava, carregando o status HTTP sugerido."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


# ── OAuth ────────────────────────────────────────────────────────────────────


def _require_credentials() -> tuple[str, str]:
    s = get_settings()
    if not s.strava_client_id or not s.strava_client_secret:
        raise StravaError(
            "Credenciais do Strava não configuradas (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET no .env).",
            status_code=503,
        )
    return s.strava_client_id, s.strava_client_secret


def build_authorization_url(request_origin: Optional[str] = None) -> tuple[str, str]:
    """Retorna (url, state). O state deve ser conferido pelo frontend no callback."""
    client_id, _ = _require_credentials()
    state = secrets.token_urlsafe(16)
    redirect_uri = get_settings().resolve_strava_redirect_uri(request_origin)
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "approval_prompt": "auto",
        "scope": _SCOPE,
        "state": state,
    }
    return f"{_AUTHORIZE_URL}?{urlencode(params)}", state


async def _token_request(extra: dict[str, str]) -> StravaTokenResponse:
    client_id, client_secret = _require_credentials()
    data = {"client_id": client_id, "client_secret": client_secret, **extra}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            resp = await client.post(_TOKEN_URL, data=data)
        except httpx.HTTPError as exc:
            raise StravaError(f"Falha de rede ao contatar o Strava: {exc}") from exc

    if resp.status_code in (400, 401):
        raise StravaError(
            "Código/refresh token inválido ou expirado. Refaça a conexão com o Strava.",
            status_code=401,
        )
    _raise_for_status(resp)

    body = resp.json()
    athlete_raw = body.get("athlete")
    return StravaTokenResponse(
        access_token=body["access_token"],
        refresh_token=body["refresh_token"],
        expires_at=int(body["expires_at"]),
        athlete=StravaAthlete(**athlete_raw) if athlete_raw else None,
    )


async def exchange_code(code: str) -> StravaTokenResponse:
    return await _token_request({"code": code, "grant_type": "authorization_code"})


async def refresh_access_token(refresh_token: str) -> StravaTokenResponse:
    return await _token_request({"refresh_token": refresh_token, "grant_type": "refresh_token"})


# ── API de dados ─────────────────────────────────────────────────────────────


def _raise_for_status(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    if resp.status_code == 401:
        raise StravaError("Token do Strava expirado ou inválido.", status_code=401)
    if resp.status_code == 403:
        raise StravaError(
            "Permissão insuficiente no Strava — autorize o escopo activity:read_all.",
            status_code=403,
        )
    if resp.status_code == 404:
        raise StravaError("Atividade não encontrada no Strava (ou sem permissão de acesso).", status_code=404)
    if resp.status_code == 429:
        raise StravaError("Limite de requisições do Strava atingido. Tente em alguns minutos.", status_code=429)
    raise StravaError(f"Strava respondeu {resp.status_code}: {resp.text[:200]}")


async def _get(client: httpx.AsyncClient, path: str, token: str, params: Optional[dict] = None) -> Any:
    try:
        resp = await client.get(
            f"{_API_BASE}{path}",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )
    except httpx.HTTPError as exc:
        raise StravaError(f"Falha de rede ao contatar o Strava: {exc}") from exc
    _raise_for_status(resp)
    return resp.json()


async def _get_streams(client: httpx.AsyncClient, token: str, activity_id: int) -> Any:
    return await _get(
        client,
        f"/activities/{activity_id}/streams",
        token,
        # Sem `resolution` o Strava devolve a série completa (segundo a segundo).
        params={"keys": _STREAM_KEYS, "key_by_type": "true", "series_type": "time"},
    )


async def list_activities(access_token: str, page: int, per_page: int) -> list[StravaActivitySummary]:
    """Lista treinos recentes do atleta (mais novos primeiro) em formato enxuto."""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        raw = await _get(
            client,
            "/athlete/activities",
            access_token,
            params={"page": page, "per_page": per_page},
        )

    return [
        StravaActivitySummary(
            id=a["id"],
            name=a.get("name") or "Atividade sem título",
            sport_type=a.get("sport_type") or a.get("type") or "Workout",
            type=a.get("type") or a.get("sport_type") or "Workout",
            start_date_local=a.get("start_date_local") or a.get("start_date") or "",
            distance=float(a.get("distance") or 0.0),
            moving_time=int(a.get("moving_time") or 0),
            has_heartrate=bool(a.get("has_heartrate")),
            average_heartrate=a.get("average_heartrate"),
            max_heartrate=a.get("max_heartrate"),
        )
        for a in raw or []
    ]


async def fetch_activity_by_id(
    access_token: str,
    activity_id: int,
    athlete_age: int,
    force_refresh: bool = False,
) -> StravaActivityResponse:
    """
    Carrega detalhes + streams de uma atividade específica e normaliza.
    Verifica primeiro `cached_activities` no SQLite local para evitar chamadas repetidas ao Strava.
    """
    if not force_refresh:
        cached = await get_cached_activity(activity_id)
        if cached is not None:
            data = dict(cached)
            data["from_cache"] = True
            return StravaActivityResponse(**data)

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        athlete, detail, streams = await asyncio.gather(
            _get(client, "/athlete", access_token),
            _get(client, f"/activities/{activity_id}", access_token),
            _get_streams(client, access_token, activity_id),
        )
    normalized = normalize_activity(detail, streams, athlete, athlete_age)
    await save_cached_activity(
        activity_id=normalized.activity_meta.id,
        name=normalized.activity_meta.name,
        sport_type=normalized.activity_meta.sport_type,
        start_date=normalized.activity_meta.start_date,
        payload=normalized.model_dump(),
    )
    return normalized


async def fetch_latest_activity(access_token: str, athlete_age: int) -> StravaActivityResponse:
    """
    Busca a atividade mais recente do atleta (priorizando treinos com FC,
    ou utilizando a mais recente com análise cinemática), seus detalhes
    e streams, devolvendo tudo normalizado para o PulseTriage.
    """
    recent = await list_activities(access_token, page=1, per_page=_RECENT_ACTIVITIES_LOOKUP)
    if not recent:
        raise StravaError("Nenhuma atividade encontrada na conta Strava.", status_code=404)

    # Prioriza treino com FC, senão pega o mais recente disponível
    summary = next((a for a in recent if a.has_heartrate), recent[0])

    return await fetch_activity_by_id(access_token, summary.id, athlete_age)


# ── Adaptador: Strava → PulseTriage ──────────────────────────────────────────


def _stream(streams: dict, key: str) -> Optional[list]:
    entry = streams.get(key) if isinstance(streams, dict) else None
    return entry.get("data") if isinstance(entry, dict) else None


def _at(series: Optional[list], i: int) -> Any:
    return series[i] if series is not None and i < len(series) else None


def map_sport_type(sport_type: str) -> Literal["run", "weight_training", "auto"]:
    st = (sport_type or "").lower()
    if st in {"weighttraining", "crossfit", "workout", "hiit"}:
        return "weight_training"
    if "run" in st:  # Run, TrailRun, VirtualRun
        return "run"
    return "auto"  # ciclismo, natação etc. → deixa a heurística decidir


def normalize_streams(streams: dict) -> tuple[list[TelemetryPoint], int, bool, bool]:
    """
    Converte streams (key_by_type) em TelemetryPoints.
    Suporta tanto treinos com monitor cardíaco quanto treinos puramente cinemáticos (sem FC).
    Retorna (pontos, descartados, foi_reamostrado, possui_fc).
    """
    time_s = _stream(streams, "time")
    if not time_s:
        raise StravaError("Atividade sem stream de tempo.", status_code=422)

    hr = _stream(streams, "heartrate")
    has_hr = bool(hr and any(b is not None and (30 <= b <= 250) for b in hr))

    vel = _stream(streams, "velocity_smooth")
    alt = _stream(streams, "altitude")
    cad = _stream(streams, "cadence")
    pwr = _stream(streams, "watts")

    points: list[TelemetryPoint] = []
    dropped = 0

    for i, t in enumerate(time_s):
        v = _at(vel, i)
        a = _at(alt, i)
        c = _at(cad, i)
        w = _at(pwr, i)

        if has_hr:
            bpm = _at(hr, i)
            # Fora da faixa aceita pelo schema = falha de sensor (0 bpm, desconexão).
            # Picos fisiologicamente implausíveis DENTRO da faixa ficam para a triagem detectar.
            if bpm is None or not (30 <= bpm <= 250):
                dropped += 1
                continue
            hr_val = int(round(bpm))
        else:
            hr_val = None

        points.append(
            TelemetryPoint(
                time_s=int(t),
                heartrate_bpm=hr_val,
                velocity_ms=max(float(v), 0.0) if v is not None else 0.0,
                altitude_m=float(a) if a is not None else 0.0,
                cadence_rpm=int(round(c)) if c is not None and c >= 0 else None,
                watts=int(round(w)) if w is not None and w >= 0 else None,
            )
        )

    downsampled = False
    if len(points) > _MAX_TELEMETRY_POINTS:
        step = -(-len(points) // _MAX_TELEMETRY_POINTS)  # ceil
        last = points[-1]
        points = points[::step]
        if points[-1] is not last:
            points.append(last)
        downsampled = True

    return points, dropped, downsampled, has_hr


def normalize_activity(
    detail: dict,
    streams: dict,
    athlete: dict,
    athlete_age: int,
) -> StravaActivityResponse:
    telemetry, dropped, downsampled, has_hr = normalize_streams(streams)
    if len(telemetry) < 10:
        raise StravaError("Telemetria insuficiente (< 10 pontos de dados).", status_code=422)

    if has_hr:
        valid_hrs = [p.heartrate_bpm for p in telemetry if p.heartrate_bpm is not None]
        observed_max = max(valid_hrs) if valid_hrs else None
        avg_hr = detail.get("average_heartrate") or (round(sum(valid_hrs) / len(valid_hrs), 1) if valid_hrs else None)
        max_hr = int(detail.get("max_heartrate") or (observed_max or 0)) if (detail.get("max_heartrate") or observed_max) else None
        max_hr_estimated = max(220 - athlete_age, max_hr or (220 - athlete_age))
    else:
        avg_hr = None
        max_hr = None
        max_hr_estimated = 220 - athlete_age

    name = " ".join(filter(None, [athlete.get("firstname"), athlete.get("lastname")])) or "Atleta Strava"
    sport_type = detail.get("sport_type") or detail.get("type") or "Workout"

    meta = ActivityMeta(
        id=str(detail["id"]),
        name=detail.get("name") or "Atividade Strava",
        type=detail.get("type") or sport_type,
        sport_type=sport_type,
        start_date=detail.get("start_date_local") or detail.get("start_date") or "",
        elapsed_time_seconds=int(detail.get("elapsed_time") or telemetry[-1].time_s),
        distance_meters=float(detail.get("distance") or 0.0),
        average_heartrate=avg_hr,
        max_heartrate=max_hr,
        average_speed=float(detail.get("average_speed") or 0.0),
        total_elevation_gain=float(detail.get("total_elevation_gain") or 0.0),
        athlete_name=name,
        athlete_age=athlete_age,
        athlete_max_hr_estimated=max_hr_estimated,
        has_heartrate=has_hr,
    )

    available = sorted(k for k in (streams or {}) if _stream(streams, k))
    logger.info(
        "Strava normalizado — atividade %s | %d pts (%d descartados, reamostrado=%s, has_hr=%s) | streams=%s",
        meta.id, len(telemetry), dropped, downsampled, has_hr, available,
    )

    return StravaActivityResponse(
        activity_meta=meta,
        telemetry=telemetry,
        suggested_activity_type=map_sport_type(sport_type),
        available_streams=available,
        dropped_points=dropped,
        downsampled=downsampled,
        has_heartrate=has_hr,
    )


async def compare_activities(
    access_token: str,
    activity_id_a: int,
    activity_id_b: int,
    athlete_age: int = 30,
    force_refresh: bool = False,
) -> CompareResponse:
    """
    Busca duas atividades do Strava (usando cache de atividades), ordena cronologicamente
    (A = mais antiga / referência, B = mais recente), verifica se o diagnóstico comparativo
    já existe em `cached_diagnostics` (`compare_{id_a}_{id_b}`) e, caso necessário,
    executa a triagem determinística, calcula deltas e chama o Gemini.
    """
    if activity_id_a == activity_id_b:
        raise StravaError("Selecione duas atividades distintas para comparar.", status_code=400)

    # Verifica se já temos o diagnóstico comparativo em cache antes mesmo de consultar o Strava
    if not force_refresh:
        for candidate_key in (
            f"compare_{activity_id_a}_{activity_id_b}",
            f"compare_{activity_id_b}_{activity_id_a}",
        ):
            cached_comp = await get_cached_diagnostic(candidate_key)
            if cached_comp is not None:
                saved_payload, created_iso = cached_comp
                return CompareResponse(
                    activity_a=StravaActivityResponse(**saved_payload["activity_a"]),
                    activity_b=StravaActivityResponse(**saved_payload["activity_b"]),
                    triage_a=DeterministicTriageResult(**saved_payload["triage_a"]),
                    triage_b=DeterministicTriageResult(**saved_payload["triage_b"]),
                    deltas=ComparisonDeltas(**saved_payload["deltas"]),
                    report=ComparisonReport(**saved_payload["report"]),
                    from_cache=True,
                    cached_at=created_iso,
                )

    act_1, act_2 = await asyncio.gather(
        fetch_activity_by_id(access_token, activity_id_a, athlete_age),
        fetch_activity_by_id(access_token, activity_id_b, athlete_age),
    )

    # Ordena cronologicamente para que A seja sempre a referência (mais antiga) e B a mais recente
    if (act_1.activity_meta.start_date or "") <= (act_2.activity_meta.start_date or ""):
        act_a, act_b = act_1, act_2
    else:
        act_a, act_b = act_2, act_1

    cache_key = f"compare_{act_a.activity_meta.id}_{act_b.activity_meta.id}"

    triage_a = run_deterministic_triage(
        telemetry=act_a.telemetry,
        max_hr_estimated=act_a.activity_meta.athlete_max_hr_estimated,
        activity_type=act_a.suggested_activity_type,
    )
    triage_b = run_deterministic_triage(
        telemetry=act_b.telemetry,
        max_hr_estimated=act_b.activity_meta.athlete_max_hr_estimated,
        activity_type=act_b.suggested_activity_type,
    )

    deltas = compute_comparison_deltas(
        meta_a=act_a.activity_meta,
        triage_a=triage_a,
        points_a=act_a.telemetry,
        meta_b=act_b.activity_meta,
        triage_b=triage_b,
        points_b=act_b.telemetry,
    )

    report = await run_gemini_comparison(
        meta_a=act_a.activity_meta,
        triage_a=triage_a,
        meta_b=act_b.activity_meta,
        triage_b=triage_b,
        deltas=deltas,
    )

    saved_iso = await save_cached_diagnostic(
        cache_key=cache_key,
        analysis_type="comparison",
        report_payload={
            "activity_a": act_a.model_dump(),
            "activity_b": act_b.model_dump(),
            "triage_a": triage_a.model_dump(),
            "triage_b": triage_b.model_dump(),
            "deltas": deltas.model_dump(),
            "report": report.model_dump(),
        },
        has_heartrate=bool(deltas.both_have_hr),
        has_sleep=False,
    )

    return CompareResponse(
        activity_a=act_a,
        activity_b=act_b,
        triage_a=triage_a,
        triage_b=triage_b,
        deltas=deltas,
        report=report,
        from_cache=False,
        cached_at=saved_iso,
    )

