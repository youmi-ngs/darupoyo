#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export APP_ENV=local DATA_BACKEND=memory PRAISE_BACKEND=fallback
export AUTH_MODE="${AUTH_MODE:-dev}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://127.0.0.1:5173,http://localhost:5173}"
exec uv run --python .venv/bin/python --no-project uvicorn src.app.main:app --host 127.0.0.1 --port 8080 --reload --reload-dir src
