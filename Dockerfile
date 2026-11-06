FROM node:20-bookworm-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip --index-url https://pypi.org/simple \
    && /opt/venv/bin/pip install --no-cache-dir --index-url https://pypi.org/simple -r memory-service/requirements.txt

ENV PATH="/opt/venv/bin:${PATH}"
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch(\x27http://127.0.0.1:\x27 + (process.env.PORT || 3000) + \x27/health\x27).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bash", "./start.sh"]
