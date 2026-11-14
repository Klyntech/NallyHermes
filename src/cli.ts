import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { NallPuter } from "./kernel/computer.js";
import { DevelopmentBrain } from "./kernel/brain.js";

const workspace = argument("--workspace") ?? process.env.NALLPUTER_WORKSPACE ?? "./.nallputer";
const dataRoot = resolve(workspace);
const computer = new NallPuter(dataRoot, new DevelopmentBrain());
await computer.initialize();

const httpMode =
  process.argv.includes("--http") ||
  Boolean(process.env.PORT) ||
  process.env.NALLPUTER_HTTP === "true";

if (httpMode) {
  const port = Number(process.env.PORT ?? argument("--port") ?? 10000);
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "nallputer", dataRoot }));
        return;
      }

      if (req.method === "POST" && (req.url === "/v1/handle" || req.url === "/handle")) {
        const body = await readJsonBody(req);
        const message = typeof body.message === "string" ? body.message.trim() : "";
        if (!message) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "message is required" }));
          return;
        }
        const computerRequest =
          typeof body.sessionId === "string" && body.sessionId
            ? { sessionId: body.sessionId, message }
            : { message };
        const response = await computer.handle(computerRequest);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }

      if (req.method === "POST" && (req.url === "/v1/tool" || req.url === "/tool")) {
        const body = await readJsonBody(req);
        const name = body.name;
        if (name !== "list_files" && name !== "read_file" && name !== "write_file" && name !== "run_command") {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "name must be list_files | read_file | write_file | run_command" }));
          return;
        }
        const response = await computer.runTool({
          sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
          name,
          input: typeof body.input === "object" && body.input && !Array.isArray(body.input)
            ? (body.input as Record<string, unknown>)
            : {}
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.error(`NallPuter HTTP listening on 0.0.0.0:${port}`);
    console.error(`Data root: ${dataRoot}`);
    console.error("GET /health  POST /v1/handle  POST /v1/tool");
  });
} else {
  console.error(`NallPuter ready. Data root: ${dataRoot}`);
  console.error('Send JSON lines like {"message":"list my files"}; Ctrl-D to stop.');
  console.error("For Render/web deploy use --http or set PORT.");

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line) as { sessionId?: string; message?: string };
      if (typeof request.message !== "string" || !request.message.trim()) {
        throw new Error("message is required");
      }
      const computerRequest = request.sessionId
        ? { sessionId: request.sessionId, message: request.message }
        : { message: request.message };
      const response = await computer.handle(computerRequest);
      process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      process.stdout.write(
        `${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`
      );
    }
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        if (!raw) {
          resolveBody({});
          return;
        }
        resolveBody(JSON.parse(raw) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
