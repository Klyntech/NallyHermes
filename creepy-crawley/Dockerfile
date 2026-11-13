FROM searxng/searxng:latest

USER root
WORKDIR /app

# Keep the API dependencies isolated from SearXNG's own Python environment.
COPY requirements.txt /app/requirements.txt
RUN /usr/local/searxng/.venv/bin/python -m venv /opt/api-venv \
    && /opt/api-venv/bin/pip install --no-cache-dir -r /app/requirements.txt

COPY app ./app
COPY searxng/settings.yml /etc/searxng/settings.yml
COPY start.sh /usr/local/bin/start-nally.sh

RUN chmod 0755 /usr/local/bin/start-nally.sh

# SearXNG stays loopback-only; Render exposes only the FastAPI port.
ENV GRANIAN_WORKERS=1 \
    GRANIAN_BLOCKING_THREADS=2 \
    SEARXNG_PORT=8080 \
    SEARXNG_BIND_ADDRESS=127.0.0.1

EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/start-nally.sh"]
