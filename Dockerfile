FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts --omit=dev
COPY dist ./dist
RUN useradd --create-home --uid 10001 nallputer \
  && mkdir -p /data \
  && chown -R nallputer:nallputer /app /data

USER nallputer
VOLUME ["/data"]
ENTRYPOINT ["node", "dist/cli.js", "--workspace", "/data"]
