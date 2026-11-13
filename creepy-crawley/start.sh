#!/bin/sh
set -u

export SEARXNG_PORT=8080
export SEARXNG_BIND_ADDRESS=127.0.0.1
export GRANIAN_HOST=127.0.0.1
export SEARXNG_LIMITER=false

# Generate a per-container secret unless Render supplies one.
if [ -z "${SEARXNG_SECRET:-}" ]; then
    SEARXNG_SECRET=$(/opt/api-venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(48))')
    export SEARXNG_SECRET
fi

# SearXNG imports its package relative to /usr/local/searxng.
cd /usr/local/searxng
/usr/local/searxng/entrypoint.sh &
SEARXNG_PID=$!
API_PID=

stop_children() {
    if [ -n "${API_PID:-}" ]; then
        kill -TERM "$API_PID" 2>/dev/null || true
    fi
    kill -TERM "$SEARXNG_PID" 2>/dev/null || true
}

trap stop_children INT TERM

# Do not report the container ready until the local search backend responds.
ready=0
attempt=0
while [ "$attempt" -lt 60 ]; do
    if /opt/api-venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=1)" >/dev/null 2>&1; then
        ready=1
        break
    fi
    if ! kill -0 "$SEARXNG_PID" 2>/dev/null; then
        echo "SearXNG exited before becoming healthy" >&2
        wait "$SEARXNG_PID" || true
        exit 1
    fi
    attempt=$((attempt + 1))
    sleep 1
done

if [ "$ready" -ne 1 ]; then
    echo "SearXNG did not become healthy within 60 seconds" >&2
    stop_children
    wait "$SEARXNG_PID" 2>/dev/null || true
    exit 1
fi

cd /app
/opt/api-venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}" &
API_PID=$!

wait "$API_PID"
API_STATUS=$?
stop_children
wait "$SEARXNG_PID" 2>/dev/null || true
exit "$API_STATUS"
