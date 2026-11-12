# Operations

## Health

- Public process health: `GET /health` on the Node service.
- Internal LightRAG health: `GET http://127.0.0.1:9621/health` inside the container.
- Telegram webhook: the configured `WEBHOOK_URL` plus the private webhook path; Telegram's secret-token header is validated.

The public health endpoint confirms that the Node HTTP server is responding. It does not prove that Neon, NVIDIA, Tavily or LightRAG are all reachable.

## Deployment

Use the Dockerfile for Render. It installs `poppler-utils`, which provides `pdftotext` for Telegram PDF ingestion. Set the required application variables and configure LightRAG only when it is needed. When enabled, the Python sidecar starts before the Node process and must pass its local health check. The container fails fast at startup if `pdftotext` is unavailable rather than accepting PDFs that cannot be extracted.

For durable user files, attach a persistent disk and set `FILE_WORKSPACE` to its mount path. Memories and schedules are stored in Neon.

## Diagnostics

- `/memorycheck` runs an isolated temporary LightRAG write/read/delete check.
- `/rerankbench` measures the configured NVIDIA reranker endpoint.
- Use Render logs for startup, webhook, model, database and background worker failures.

## Routine release checks

1. Review the Git diff and confirm no secrets or user data are included.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Run `npm run build`.
5. Confirm Python syntax with `python -m compileall -q memory-service`.
6. Deploy to a staging or beta service and test Telegram end-to-end.
7. Verify memory isolation, reminder delivery, timezone handling, workspace boundaries and progress editing.
8. Review dependency advisories and confirm the deployment uses a persistent file volume if file durability is required.

## Recovery

If a deploy fails, inspect the first failing build or startup step rather than changing unrelated dependency versions. Keep the previous working deployment available until the new build and Telegram smoke tests pass.
