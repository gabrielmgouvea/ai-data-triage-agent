"""
PulseTriage — Aplicação FastAPI principal.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import init_db
from app.routers import analyze, demo, strava

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Inicializa o banco SQLite local (`pulsetriage.db`) no startup."""
    await init_db()
    yield


app = FastAPI(
    title="PulseTriage API",
    description=(
        "Plataforma de Telemetria Esportiva & Análise de Prontidão com IA. "
        "Ingere dados de treino (Strava ou Demo) e cruza com contexto de sono "
        "para gerar diagnósticos fisiológicos via Gemini."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ─────────────────────────────────────────────────────────────────
app.include_router(demo.router)
app.include_router(analyze.router)
app.include_router(analyze.triage_alias_router)
app.include_router(strava.router)


# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check() -> dict[str, str]:
    """Verificação de saúde básica para monitoramento e CI."""
    return {"status": "ok", "service": "pulsetriage-backend", "version": app.version}
