"""
Router Strava — Fase 5: OAuth 2.0 e ingestão de telemetria real.

Rotas:
  GET  /api/strava/auth-url          → URL de autorização (scope read,activity:read_all)
  POST /api/strava/exchange-token    → troca o `code` por access/refresh token + atleta
  POST /api/strava/refresh-token     → renova o access_token expirado (validade de 6h)
  GET  /api/strava/latest-activity   → última atividade com FC, normalizada p/ o PulseTriage
  GET  /api/strava/activities        → lista paginada de treinos recentes (seletor)
  GET  /api/strava/activity/{id}/streams → streams de uma atividade específica, normalizados

A atividade retornada é compatível com POST /api/v1/analyze (triagem determinística + Gemini).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request

from app.models import (
    CompareRequest,
    CompareResponse,
    StravaActivityResponse,
    StravaActivitySummary,
    StravaAuthUrlResponse,
    StravaRefreshRequest,
    StravaTokenExchangeRequest,
    StravaTokenResponse,
)
from app.services import strava as strava_service
from app.services.strava import StravaError

router = APIRouter(prefix="/api/strava", tags=["Strava"])


def _http_error(exc: StravaError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


def _bearer_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Header 'Authorization: Bearer <access_token>' ausente.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Access token vazio.")
    return token


@router.get("/auth-url", response_model=StravaAuthUrlResponse, summary="URL de autorização OAuth do Strava")
async def get_auth_url(request: Request) -> StravaAuthUrlResponse:
    origin = request.headers.get("origin")
    if not origin:
        fwd_host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        fwd_proto = request.headers.get("x-forwarded-proto") or "https"
        if fwd_host and "localhost" not in fwd_host and "127.0.0.1" not in fwd_host:
            origin = f"{fwd_proto}://{fwd_host}"
    try:
        url, state = strava_service.build_authorization_url(request_origin=origin)
    except StravaError as exc:
        raise _http_error(exc)
    return StravaAuthUrlResponse(url=url, state=state)


@router.post("/exchange-token", response_model=StravaTokenResponse, summary="Troca o code OAuth por tokens")
async def exchange_token(payload: StravaTokenExchangeRequest) -> StravaTokenResponse:
    try:
        return await strava_service.exchange_code(payload.code)
    except StravaError as exc:
        raise _http_error(exc)


@router.post("/refresh-token", response_model=StravaTokenResponse, summary="Renova o access token")
async def refresh_token(payload: StravaRefreshRequest) -> StravaTokenResponse:
    try:
        return await strava_service.refresh_access_token(payload.refresh_token)
    except StravaError as exc:
        raise _http_error(exc)


@router.get(
    "/latest-activity",
    response_model=StravaActivityResponse,
    summary="Última atividade do atleta com streams de alta resolução",
)
async def latest_activity(
    authorization: Optional[str] = Header(None),
    athlete_age: int = Query(30, ge=10, le=100, description="Idade do atleta (para FCmax = 220 − idade)."),
) -> StravaActivityResponse:
    token = _bearer_token(authorization)
    try:
        return await strava_service.fetch_latest_activity(token, athlete_age)
    except StravaError as exc:
        raise _http_error(exc)


@router.get(
    "/activities",
    response_model=list[StravaActivitySummary],
    summary="Lista paginada de treinos recentes do atleta",
)
async def list_activities(
    authorization: Optional[str] = Header(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(15, ge=1, le=100),
) -> list[StravaActivitySummary]:
    token = _bearer_token(authorization)
    try:
        return await strava_service.list_activities(token, page, per_page)
    except StravaError as exc:
        raise _http_error(exc)


@router.get(
    "/activity/{activity_id}/streams",
    response_model=StravaActivityResponse,
    summary="Streams de alta resolução de uma atividade, normalizados p/ o PulseTriage",
)
async def activity_streams(
    activity_id: int,
    authorization: Optional[str] = Header(None),
    athlete_age: int = Query(30, ge=10, le=100, description="Idade do atleta (para FCmax = 220 − idade)."),
    force_refresh: bool = Query(False, description="Se True, ignora o cache local de streams."),
) -> StravaActivityResponse:
    token = _bearer_token(authorization)
    try:
        return await strava_service.fetch_activity_by_id(token, activity_id, athlete_age, force_refresh=force_refresh)
    except StravaError as exc:
        raise _http_error(exc)


@router.post(
    "/compare",
    response_model=CompareResponse,
    summary="Comparador Head-to-Head de dois treinos (Treino A vs. Treino B) com Triagem + Gemini",
)
async def compare_activities_endpoint(
    payload: CompareRequest,
    authorization: Optional[str] = Header(None),
) -> CompareResponse:
    token = _bearer_token(authorization)
    try:
        return await strava_service.compare_activities(
            access_token=token,
            activity_id_a=int(payload.activity_id_a),
            activity_id_b=int(payload.activity_id_b),
            athlete_age=payload.athlete_age,
            force_refresh=payload.force_refresh,
        )
    except StravaError as exc:
        raise _http_error(exc)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

