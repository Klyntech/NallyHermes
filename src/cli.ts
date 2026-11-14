import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { NallPuter } from "./kernel/computer.js";
import { DevelopmentBrain } from "./kernel/brain.js";

const workspace = argument("--workspace") ?? "./.nallputer";
const dataRoot = resolve(workspace);
const computer = new NallPuter(dataRoot, new DevelopmentBrain());
await computer.initialize();

console.error(`NallPuter ready. Data root: ${dataRoot}`);
console.error('Send JSON lines like {"message":"list my files"}; Ctrl-D to stop.');

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of input) {
  if (!line.trim()) continue;
  try {
    const request = JSON.parse(line) as { sessionId?: string; message?: string };
    if (typeof request.message !== "string" || !request.message.trim()) throw new Error("message is required");
    const computerRequest = request.sessionId
      ? { sessionId: request.sessionId, message: request.message }
      : { message: request.message };
    const response = await computer.handle(computerRequest);
    process.stdout.write(`${JSON.stringify(response)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
