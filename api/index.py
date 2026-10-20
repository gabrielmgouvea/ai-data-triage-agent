"""
Vercel Python Serverless Function Entrypoint (ASGI Bridge for FastAPI).
Exposes the FastAPI `app` instance from `backend/app/main.py` so that
`/api/strava/*`, `/api/v1/*`, `/api/triage/*`, and `/health` are served
natively as a Vercel Serverless Function alongside the Next.js frontend.
"""
import os
import sys
from pathlib import Path

# Ensure the `backend` directory is on sys.path for `app.*` imports
ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Load local .env if present (Vercel injects env vars directly in production)
try:
    from dotenv import load_dotenv

    env_path = BACKEND_DIR / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
except Exception:
    pass

from app.main import app  # noqa: E402, F401
