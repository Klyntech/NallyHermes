FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts --omit=dev
COPY --from=build /app/dist ./dist

RUN useradd --create-home --uid 10001 nallputer \
  && mkdir -p /data \
  && chown -R nallputer:nallputer /app /data

USER nallputer
VOLUME ["/data"]
# tsc rootDir is repo root, so cli emits to dist/src/cli.js
ENTRYPOINT ["node", "dist/src/cli.js", "--workspace", "/data"]
