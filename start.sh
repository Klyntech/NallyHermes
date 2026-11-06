#!/usr/bin/env bash
set -euo pipefail

LIGHTRAG_PID=""
NODE_PID=""

cleanup() {
  if [[ -n "$NODE_PID" ]]; then kill "$NODE_PID" 2>/dev/null || true; fi
  if [[ -n "$LIGHTRAG_PID" ]]; then kill "$LIGHTRAG_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "${LIGHTRAG_ENABLED:-false}" == "true" ]]; then
  python -m uvicorn app:app --app-dir memory-service --host 127.0.0.1 --port 9621 &
  LIGHTRAG_PID=$!

  python - <<'PY'
import time
import urllib.request

for attempt in range(60):
    try:
        urllib.request.urlopen("http://127.0.0.1:9621/health", timeout=2).read()
        break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit("LightRAG service did not become healthy within 60 seconds.")
PY
fi

npm start &
NODE_PID=$!

if [[ -n "$LIGHTRAG_PID" ]]; then
  set +e
  wait -n "$LIGHTRAG_PID" "$NODE_PID"
  STATUS=$?
  set -e
else
  set +e
  wait "$NODE_PID"
  STATUS=$?
  set -e
fi

exit "$STATUS"
