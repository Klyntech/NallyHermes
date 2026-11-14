FROM searxng/searxng:latest

USER root
WORKDIR /app

# Download the official x86-64 Lightpanda headless browser in a build stage.
# Its binary is copied into the existing API/SearXNG container; no extra
# Render service or Chromium installation is created.
FROM ubuntu:24.04 AS lightpanda
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fL --retry 3 \
       https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux \
       -o /usr/local/bin/lightpanda \
    && chmod 0755 /usr/local/bin/lightpanda

FROM searxng/searxng:latest
USER root
WORKDIR /app

COPY --from=lightpanda /usr/local/bin/lightpanda /usr/local/bin/lightpanda
RUN ldd /usr/local/bin/lightpanda

# Keep the API dependencies isolated from SearXNG's own Python environment.
COPY requirements.txt /app/requirements.txt
RUN /usr/local/searxng/.venv/bin/python -m venv /opt/api-venv \
    && /opt/api-venv/bin/pip install --no-cache-dir -r /app/requirements.txt

COPY app ./app
COPY searxng/settings.yml /etc/searxng/settings.yml
COPY start.sh /usr/local/bin/start-nally.sh

RUN chmod 0755 /usr/local/bin/start-nally.sh

# Browser rendering is installed but disabled until outbound browser traffic
# can be constrained safely. SearXNG remains loopback-only.
ENV GRANIAN_WORKERS=1 \
    GRANIAN_BLOCKING_THREADS=2 \
    SEARXNG_PORT=8080 \
    SEARXNG_BIND_ADDRESS=127.0.0.1 \
    LIGHTPANDA_BIN=/usr/local/bin/lightpanda \
    LIGHTPANDA_ENABLED=false \
    LIGHTPANDA_WAIT_MS=1000

EXPOSE 10000
ENTRYPOINT ["/usr/local/bin/start-nally.sh"]
