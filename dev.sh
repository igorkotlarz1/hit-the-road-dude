#!/usr/bin/env bash
# Odpala backend (FastAPI :8000) i front (Vite :5173) jednoczesnie. Ctrl+C zamyka oba.
set -e
cd "$(dirname "$0")"
(cd backend && uv run uvicorn server:app --reload --port 8000) &
BACK=$!
trap 'kill $BACK 2>/dev/null' EXIT
cd frontend && npm run dev
