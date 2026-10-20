"""
Router para análise fisiológica com IA — Fase 2.
Rota: POST /api/v1/analyze
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException

from app.database import get_cached_diagnostic, save_cached_diagnostic
from app.models import (
    AnalyzeRequest,
    AnalyzeResponse,
    DemoActivityResponse,
    DeterministicTriageResult,
    IncidentReport,
)
from app.services.gemini import run_gemini_analysis
from app.services.triage import run_deterministic_triage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Análise"])
triage_alias_router = APIRouter(prefix="/api/triage", tags=["Análise"])

_MOCK_PATH = Path(__file__).parent.parent.parent / "mock_activity.json"
_MOCK_STRENGTH_PATH = Path(__file__).parent.parent.parent / "mock_strength.json"


async def _execute_analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    """
    Pipeline completo de análise com suporte a cache SQLite (`cached_diagnostics`):
    - Chave de cache: `activity_{id}`
    - Se `force_refresh == False` e existir no banco (com mesmo status `has_sleep`), retorna imediatamente.
    - Caso contrário, roda Triagem Determinística + Gemini e persiste no banco.
    """
    cache_key = f"activity_{payload.activity_meta.id}"
    has_sleep = payload.sleep_context is not None

    if not payload.force_refresh:
        cached = await get_cached_diagnostic(cache_key, has_sleep=has_sleep)
        if cached is not None:
            saved_payload, created_iso = cached
            return AnalyzeResponse(
                triage=DeterministicTriageResult(**saved_payload["triage"]),
                report=IncidentReport(**saved_payload["report"]),
                from_cache=True,
                cached_at=created_iso,
            )

    logger.info(
        "Análise iniciada (force_refresh=%s) — atleta: %s | pontos de telemetria: %d",
        payload.force_refresh,
        payload.activity_meta.athlete_name,
        len(payload.telemetry),
    )

    # ── Passo 1: Filtro determinístico ───────────────────────────────────────
    try:
        triage_result = run_deterministic_triage(
            telemetry=payload.telemetry,
            max_hr_estimated=payload.activity_meta.athlete_max_hr_estimated,
            activity_type=payload.activity_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    logger.info(
        "Triagem concluída — %d incidentes | drift=%s | anaeróbico=%ds | tipo=%s",
        len(triage_result.incidents),
        triage_result.cardiac_drift_detected,
        triage_result.time_in_anaerobic_zone_seconds,
        triage_result.activity_type_detected,
    )

    # ── Passo 2: Análise Gemini ───────────────────────────────────────────────
    try:
        report = await run_gemini_analysis(
            meta=payload.activity_meta,
            sleep=payload.sleep_context,
            triage=triage_result,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    logger.info("Relatório gerado — severidade: %s", report.severity)

    saved_iso = await save_cached_diagnostic(
        cache_key=cache_key,
        analysis_type="single",
        report_payload={
            "triage": triage_result.model_dump(),
            "report": report.model_dump(),
        },
        has_heartrate=bool(triage_result.has_heartrate),
        has_sleep=has_sleep,
    )

    return AnalyzeResponse(
        triage=triage_result,
        report=report,
        from_cache=False,
        cached_at=saved_iso,
    )


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Análise fisiológica com IA (com Cache SQLite)",
)
async def analyze_activity(payload: AnalyzeRequest) -> AnalyzeResponse:
    return await _execute_analyze(payload)


@triage_alias_router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    summary="Análise fisiológica com IA (Alias /api/triage/analyze)",
)
async def analyze_activity_alias(payload: AnalyzeRequest) -> AnalyzeResponse:
    return await _execute_analyze(payload)


@router.post(
    "/analyze/demo",
    response_model=AnalyzeResponse,
    summary="Análise fisiológica sobre dados de demonstração",
    description=(
        "Executa o pipeline de análise completo usando dados simulados. "
        "Não requer payload completo."
    ),
)
async def analyze_demo(
    type: Literal["run", "strength"] = "run",
    force_refresh: bool = False,
) -> AnalyzeResponse:
    """Carrega o mock e dispara o pipeline de análise completo."""
    path = _MOCK_STRENGTH_PATH if type == "strength" else _MOCK_PATH

    if not path.exists():
        raise HTTPException(status_code=500, detail="Arquivo de mock não encontrado.")

    with path.open(encoding="utf-8") as f:
        raw = json.load(f)

    demo = DemoActivityResponse(**raw)

    # Reutiliza o endpoint principal via objeto AnalyzeRequest
    request = AnalyzeRequest(
        activity_meta=demo.activity_meta,
        sleep_context=demo.sleep_context,
        telemetry=demo.telemetry,
        activity_type="weight_training" if type == "strength" else "run",
        force_refresh=force_refresh,
    )
    return await analyze_activity(request)
