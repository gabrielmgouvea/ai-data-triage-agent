"""
PulseTriage Backend — Configurações da aplicação via Pydantic Settings.
"""
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ENV = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_BACKEND_ENV), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"

    # Gemini
    gemini_api_key: str = ""

    # Strava
    strava_client_id: str = ""
    strava_client_secret: str = ""
    strava_redirect_uri: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        for env_key in ("NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"):
            val = os.getenv(env_key, "").strip()
            if val:
                url = val if val.startswith("http") else f"https://{val}"
                url = url.rstrip("/")
                if url not in origins:
                    origins.append(url)
        if "http://localhost:3000" not in origins:
            origins.append("http://localhost:3000")
        return origins

    def resolve_strava_redirect_uri(self, request_origin: str | None = None) -> str:
        """
        Resolve dinamicamente a URL de callback do Strava:
        1. Se STRAVA_REDIRECT_URI estiver explicitamente definida (e não for localhost em produção Vercel), usa ela.
        2. Se houver Origin da requisição (ex: https://meu-app.vercel.app), usa {origin}/strava/callback.
        3. Se houver NEXT_PUBLIC_APP_URL / VERCEL_PROJECT_PRODUCTION_URL / VERCEL_URL, usa https://{domain}/strava/callback.
        4. Fallback para http://localhost:3000/strava/callback em desenvolvimento local.
        """
        is_vercel = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))
        configured = (self.strava_redirect_uri or "").strip()

        if configured and not (is_vercel and "localhost" in configured):
            return configured

        if request_origin and request_origin.startswith("http"):
            return f"{request_origin.rstrip('/')}/strava/callback"

        for env_key in ("NEXT_PUBLIC_APP_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"):
            val = os.getenv(env_key, "").strip()
            if val:
                base = val if val.startswith("http") else f"https://{val}"
                return f"{base.rstrip('/')}/strava/callback"

        return configured or "http://localhost:3000/strava/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()
