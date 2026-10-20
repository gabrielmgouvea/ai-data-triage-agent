"""
Router para as rotas de demonstração do PulseTriage.
Fase 1: GET /api/v1/demo — retorna telemetria e contexto de sono mockados.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.models import DemoActivityResponse

router = APIRouter(prefix="/api/v1", tags=["Demo"])

from typing import Literal

# Caminhos para os mocks
_MOCK_RUN_PATH = Path(__file__).parent.parent.parent / "mock_activity.json"
_MOCK_STRENGTH_PATH = Path(__file__).parent.parent.parent / "mock_strength.json"

@router.get(
    "/demo",
    response_model=DemoActivityResponse,
    summary="Atividade de demonstração",
    description=(
        "Retorna uma atividade simulada (Corrida ou Força) com telemetria segundo a segundo "
        "e um contexto completo de sono/prontidão."
    ),
)
async def get_demo_activity(type: Literal["run", "strength"] = "run") -> DemoActivityResponse:
    """Carrega e valida o JSON de mock apropriado, devolvendo a resposta tipada."""
    path = _MOCK_STRENGTH_PATH if type == "strength" else _MOCK_RUN_PATH
    
    if not path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Arquivo de mock não encontrado: {path}",
        )

    with path.open(encoding="utf-8") as f:
        raw = json.load(f)

    return DemoActivityResponse(**raw)
