"""
PulseTriage — Banco de Dados Local SQLite (SQLAlchemy Assíncrono + aiosqlite).

Armazena em cache local (`pulsetriage.db`):
  1. `cached_activities`: telemetria de alta resolução já normalizada vinda do Strava.
  2. `cached_diagnostics`: relatórios determinísticos + diagnósticos da IA (individuais e comparativos).
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import JSON, Boolean, DateTime, String, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

logger = logging.getLogger(__name__)

IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))

if IS_VERCEL:
    _DB_PATH = Path("/tmp/pulsetriage.db")
    DATABASE_URL = "sqlite+aiosqlite:////tmp/pulsetriage.db"
else:
    _DB_PATH = Path(__file__).resolve().parent.parent / "pulsetriage.db"
    DATABASE_URL = f"sqlite+aiosqlite:///{_DB_PATH.as_posix()}"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args={"timeout": 15, "check_same_thread": False},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

_init_lock = asyncio.Lock()
_db_initialized = False


class Base(DeclarativeBase):
    pass


class CachedActivity(Base):
    """Armazena a atividade normalizada e seus streams de telemetria."""

    __tablename__ = "cached_activities"

    activity_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    sport_type: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[str] = mapped_column(String, nullable=False)
    normalized_telemetry: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class CachedDiagnostic(Base):
    """Armazena diagnósticos individuais (`activity_{id}`) e comparativos (`compare_{id_a}_{id_b}`)."""

    __tablename__ = "cached_diagnostics"

    cache_key: Mapped[str] = mapped_column(String, primary_key=True)
    analysis_type: Mapped[str] = mapped_column(String, nullable=False)  # 'single' | 'comparison'
    report_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    has_heartrate: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_sleep: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


async def init_db() -> None:
    """
    Cria as tabelas SQLite de forma segura e idempotente (suporta concorrência Serverless).
    Em ambiente Vercel, utiliza /tmp/pulsetriage.db.
    """
    global _db_initialized
    if _db_initialized:
        return
    async with _init_lock:
        if _db_initialized:
            return
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            _db_initialized = True
            logger.info("Banco SQLite inicializado em %s (Vercel=%s)", _DB_PATH, IS_VERCEL)
        except Exception as exc:
            logger.warning("Aviso ao inicializar SQLite (%s): %s", _DB_PATH, exc)


async def get_cached_activity(activity_id: str | int) -> Optional[dict[str, Any]]:
    """Retorna o payload de StravaActivityResponse salvo em cached_activities, se existir."""
    await init_db()
    key = str(activity_id)
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(CachedActivity).where(CachedActivity.activity_id == key)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if row is None:
                return None
            logger.info("Cache HIT em cached_activities para activity_id=%s", key)
            return row.normalized_telemetry
    except Exception as exc:
        logger.warning("Falha ao ler cached_activities (%s): %s", key, exc)
        return None


async def save_cached_activity(
    activity_id: str | int,
    name: str,
    sport_type: str,
    start_date: str,
    payload: dict[str, Any],
) -> None:
    """Insere ou atualiza a atividade normalizada em cached_activities."""
    await init_db()
    key = str(activity_id)
    now = datetime.now(timezone.utc)
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(CachedActivity).where(CachedActivity.activity_id == key)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                existing.name = name
                existing.sport_type = sport_type
                existing.start_date = start_date
                existing.normalized_telemetry = payload
                existing.created_at = now
            else:
                session.add(
                    CachedActivity(
                        activity_id=key,
                        name=name,
                        sport_type=sport_type,
                        start_date=start_date,
                        normalized_telemetry=payload,
                        created_at=now,
                    )
                )
            await session.commit()
        logger.info("Atividade salva em cached_activities: activity_id=%s", key)
    except Exception as exc:
        logger.warning("Falha ao salvar cached_activities (%s): %s", key, exc)


async def get_cached_diagnostic(
    cache_key: str,
    has_sleep: Optional[bool] = None,
) -> Optional[tuple[dict[str, Any], str]]:
    """
    Busca um diagnóstico salvo em cached_diagnostics.
    Retorna (report_payload, created_at_iso) se encontrado.
    """
    await init_db()
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(CachedDiagnostic).where(CachedDiagnostic.cache_key == cache_key)
            result = await session.execute(stmt)
            row = result.scalar_one_or_none()
            if row is None:
                return None
            if has_sleep is not None and row.has_sleep != has_sleep:
                # Se o atleta adicionou ou removeu contexto de sono, recalcula
                return None
            created_iso = (
                row.created_at.isoformat()
                if row.created_at
                else datetime.now(timezone.utc).isoformat()
            )
            logger.info("Cache HIT em cached_diagnostics para cache_key=%s", cache_key)
            return row.report_payload, created_iso
    except Exception as exc:
        logger.warning("Falha ao ler cached_diagnostics (%s): %s", cache_key, exc)
        return None


async def save_cached_diagnostic(
    cache_key: str,
    analysis_type: str,
    report_payload: dict[str, Any],
    has_heartrate: bool,
    has_sleep: bool,
) -> str:
    """Salva ou atualiza o diagnóstico em cached_diagnostics e retorna o timestamp ISO."""
    await init_db()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(CachedDiagnostic).where(CachedDiagnostic.cache_key == cache_key)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                existing.analysis_type = analysis_type
                existing.report_payload = report_payload
                existing.has_heartrate = has_heartrate
                existing.has_sleep = has_sleep
                existing.created_at = now
            else:
                session.add(
                    CachedDiagnostic(
                        cache_key=cache_key,
                        analysis_type=analysis_type,
                        report_payload=report_payload,
                        has_heartrate=has_heartrate,
                        has_sleep=has_sleep,
                        created_at=now,
                    )
                )
            await session.commit()
        logger.info("Diagnóstico salvo em cached_diagnostics: cache_key=%s", cache_key)
    except Exception as exc:
        logger.warning("Falha ao salvar cached_diagnostics (%s): %s", cache_key, exc)
    return now_iso
