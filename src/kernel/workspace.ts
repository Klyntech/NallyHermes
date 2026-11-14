import { mkdir, readdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const MAX_READ_BYTES = 1_000_000;
const MAX_WRITE_BYTES = 1_000_000;

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  resolveSafe(relativePath: string): string {
    if (!relativePath || isAbsolute(relativePath)) throw new Error("Path must be a non-empty relative path.");
    const candidate = resolve(this.root, relativePath);
    const relation = relative(this.root, candidate);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new Error("Path escapes the session workspace.");
    }
    return candidate;
  }

  async list(relativePath = "."): Promise<string[]> {
    const directory = this.resolveSafe(relativePath);
    await this.assertInsideRealRoot(directory);
    return (await readdir(directory, { withFileTypes: true })).map((entry) => `${entry.isDirectory() ? "dir" : "file"}:${entry.name}`).sort();
  }

  async read(relativePath: string): Promise<string> {
    const target = this.resolveSafe(relativePath);
    await this.assertInsideRealRoot(target);
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Only regular files can be read.");
    if (info.size > MAX_READ_BYTES) throw new Error(`File exceeds ${MAX_READ_BYTES} byte read limit.`);
    return readFile(target, "utf8");
  }

  async write(relativePath: string, content: string): Promise<void> {
    const target = this.resolveSafe(relativePath);
    if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) throw new Error(`File exceeds ${MAX_WRITE_BYTES} byte write limit.`);
    await mkdir(dirname(target), { recursive: true });
    await this.assertInsideRealRoot(dirname(target));
    await writeFile(target, content, { encoding: "utf8", mode: 0o600 });
  }

  private async assertInsideRealRoot(candidate: string): Promise<void> {
    const root = await realpath(this.root);
    let parent = candidate;
    try {
      parent = await realpath(candidate);
    } catch {
      parent = await realpath(dirname(candidate));
    }
    const relation = relative(root, parent);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      throw new Error("Resolved path escapes the workspace.");
    }
  }
}
