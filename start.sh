#!/usr/bin/env bash
set -euo pipefail

python -m uvicorn app:app --app-dir memory-service --host 127.0.0.1 --port 9621 &
LIGHTRAG_PID=$!

cleanup() {
  kill "$LIGHTRAG_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

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

npm start &
NODE_PID=$!

set +e
wait -n "$LIGHTRAG_PID" "$NODE_PID"
STATUS=$?
set -e

kill "$LIGHTRAG_PID" "$NODE_PID" 2>/dev/null || true
wait 2>/dev/null || true
exit "$STATUS"
