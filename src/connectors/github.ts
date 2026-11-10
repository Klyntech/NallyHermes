import { config } from "../config.js";

export type GitHubOperationName =
  | "get_repository"
  | "list_issues"
  | "get_issue"
  | "list_pull_requests"
  | "get_file"
  | "list_commits"
  | "create_issue";

export interface GitHubOperationDescription {
  name: GitHubOperationName;
  description: string;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
}

const operations: GitHubOperationDescription[] = [
  { name: "get_repository", description: "Read repository metadata.", readOnly: true, inputSchema: { type: "object", required: ["owner", "repo"], properties: { owner: { type: "string" }, repo: { type: "string" } }, additionalProperties: false } },
  { name: "list_issues", description: "List repository issues.", readOnly: true, inputSchema: { type: "object", required: ["owner", "repo"], properties: { owner: { type: "string" }, repo: { type: "string" }, state: { type: "string", enum: ["open", "closed", "all"] }, per_page: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "get_issue", description: "Read one repository issue.", readOnly: true, inputSchema: { type: "object", required: ["owner", "repo", "issue_number"], properties: { owner: { type: "string" }, repo: { type: "string" }, issue_number: { type: "integer", minimum: 1 } }, additionalProperties: false } },
  { name: "list_pull_requests", description: "List repository pull requests.", readOnly: true, inputSchema: { type: "object", required: ["owner", "repo"], properties: { owner: { type: "string" }, repo: { type: "string" }, state: { type: "string", enum: ["open", "closed", "all"] }, per_page: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "get_file", description: "Read a file or directory from a repository at a ref.", readOnly: true, inputSchema: { type: "object", required: ["owner", "repo", "path"], properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, ref: { type: "string" } }, additionalProperties: false } },
  { name: "list_commits", description: "List commits in a repository or path.", readOnly: true, inputSchema: { type: "object", required: ["owner", "repo"], properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, sha: { type: "string" }, per_page: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "create_issue", description: "Create a repository issue; requires explicit approval and write access to be enabled.", readOnly: false, inputSchema: { type: "object", required: ["owner", "repo", "title"], properties: { owner: { type: "string" }, repo: { type: "string" }, title: { type: "string", minLength: 1, maxLength: 256 }, body: { type: "string", maxLength: 65536 }, labels: { type: "array", items: { type: "string" }, maxItems: 20 } }, additionalProperties: false } }
];

function allowedRepositories(): Set<string> {
  return new Set(config.GITHUB_ALLOWED_REPOS.split(",").map((repo) => repo.trim().toLowerCase()).filter(Boolean));
}

function assertRepo(args: Record<string, unknown>): { owner: string; repo: string } {
  const owner = String(args.owner ?? "").trim();
  const repo = String(args.repo ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) throw new Error("GitHub owner and repo are required.");
  if (!allowedRepositories().has(`${owner}/${repo}`.toLowerCase())) throw new Error("This repository is not in Nally's GitHub allowlist.");
  return { owner, repo };
}

function operation(name: string): GitHubOperationDescription {
  const found = operations.find((item) => item.name === name);
  if (!found) throw new Error(`Unknown GitHub operation: ${name}`);
  return found;
}

function assertConfigured(): string {
  if (!config.GITHUB_TOKEN) throw new Error("GitHub is not configured. Add GITHUB_TOKEN and GITHUB_ALLOWED_REPOS.");
  if (!allowedRepositories().size) throw new Error("GitHub is fail-closed until GITHUB_ALLOWED_REPOS is configured.");
  return config.GITHUB_TOKEN;
}

function queryString(args: Record<string, unknown>, keys: string[]): string {
  const query = new URLSearchParams();
  for (const key of keys) if (args[key] !== undefined && args[key] !== "") query.set(key, String(args[key]));
  const value = query.toString();
  return value ? `?${value}` : "";
}

async function githubFetch(token: string, path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "NallyHermes-GitHub-Connector",
      ...(init.headers ?? {})
    },
    signal: AbortSignal.timeout(config.GITHUB_TIMEOUT_MS)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String((body as { message?: unknown }).message) : `GitHub API returned ${response.status}`;
    throw new Error(message.slice(0, 500));
  }
  return body;
}

export function listGitHubOperations(): GitHubOperationDescription[] { return operations.map((item) => ({ ...item, inputSchema: structuredClone(item.inputSchema) })); }
export function getGitHubOperation(name: string): GitHubOperationDescription { return { ...operation(name), inputSchema: structuredClone(operation(name).inputSchema) }; }

export async function callGitHubOperation(name: string, args: Record<string, unknown>, approved = false): Promise<unknown> {
  const token = assertConfigured();
  const definition = operation(name);
  if (!definition.readOnly && (!config.GITHUB_ALLOW_WRITES || !approved)) throw new Error("GitHub write operations require GITHUB_ALLOW_WRITES=true and explicit approval.");
  const { owner, repo } = assertRepo(args);
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  switch (name) {
    case "get_repository": return githubFetch(token, base);
    case "list_issues": return githubFetch(token, `${base}/issues${queryString(args, ["state", "per_page"])}`);
    case "get_issue": return githubFetch(token, `${base}/issues/${Number(args.issue_number)}`);
    case "list_pull_requests": return githubFetch(token, `${base}/pulls${queryString(args, ["state", "per_page"])}`);
    case "get_file": return githubFetch(token, `${base}/contents/${String(args.path).split("/").map(encodeURIComponent).join("/")}${queryString(args, ["ref"])}`);
    case "list_commits": return githubFetch(token, `${base}/commits${queryString(args, ["path", "sha", "per_page"])}`);
    case "create_issue": return githubFetch(token, `${base}/issues`, { method: "POST", body: JSON.stringify({ title: String(args.title), body: args.body ? String(args.body) : undefined, labels: Array.isArray(args.labels) ? args.labels.map(String) : undefined }), headers: { "content-type": "application/json" } });
  }
}
