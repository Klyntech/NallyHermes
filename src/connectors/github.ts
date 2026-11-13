import { config } from "../config.js";

export interface GitHubOperationDescription { name: string; description: string; readOnly: boolean; inputSchema: Record<string, unknown>; }
type Method = "GET" | "POST" | "PATCH" | "PUT";
type Spec = GitHubOperationDescription & { method: Method; path: (a: Record<string, unknown>) => string; body?: (a: Record<string, unknown>) => unknown };

/** Commits created through Nally always attribute authorship to NallyHermes. */
const NALLY_COMMIT_IDENTITY = {
  name: "NallyHermes",
  email: "nallyhermes@users.noreply.github.com"
} as const;

const repo = (a: Record<string, unknown>): string => {
  const owner = String(a.owner ?? "").trim(); const name = String(a.repo ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(name)) throw new Error("GitHub owner and repo are required.");
  if (!config.GITHUB_ALLOW_ALL_REPOS && !new Set(config.GITHUB_ALLOWED_REPOS.split(",").map(x => x.trim().toLowerCase()).filter(Boolean)).has(`${owner}/${name}`.toLowerCase())) throw new Error("This repository is not in Nally's GitHub allowlist.");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
};
const n = (a: Record<string, unknown>, key: string): number => { const v = Number(a[key]); if (!Number.isInteger(v) || v < 1) throw new Error(`${key} must be a positive integer.`); return v; };
const safePath = (a: Record<string, unknown>): string => { const p = String(a.path ?? "").replace(/^\/+/, ""); if (!p || p.includes("..")) throw new Error("A safe repository path is required."); return p.split("/").map(encodeURIComponent).join("/"); };
const pick = (a: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(k => a[k] !== undefined).map(k => [k, a[k]]));
/** Build query string for list endpoints. Includes params needed for /user/repos and similar. */
const q = (a: Record<string, unknown>): string => {
  const s = new URLSearchParams();
  for (const k of ["state", "per_page", "ref", "sha", "path", "page", "sort", "direction", "type", "visibility", "affiliation"]) {
    if (a[k] !== undefined && a[k] !== null && String(a[k]).length > 0) s.set(k, String(a[k]));
  }
  return s.toString() ? `?${s}` : "";
};
const rs = (path: (a: Record<string, unknown>) => string, description: string, name: string): Spec => ({ name, description, readOnly: true, method: "GET", path, inputSchema: { type: "object", additionalProperties: true } });
const ws = (name: string, description: string, method: Method, path: (a: Record<string, unknown>) => string, body: (a: Record<string, unknown>) => unknown): Spec => ({ name, description, readOnly: false, method, path, body, inputSchema: { type: "object", additionalProperties: true } });

function withNallyAuthor(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    author: { ...NALLY_COMMIT_IDENTITY },
    committer: { ...NALLY_COMMIT_IDENTITY }
  };
}

const operations: Spec[] = [
  rs(a => `/repos/${repo(a)}`, "Read repository metadata.", "get_repository"),
  rs(a => `/repos/${repo(a)}/issues`, "List repository issues.", "list_issues"), rs(a => `/repos/${repo(a)}/issues/${n(a,"issue_number")}`, "Read one issue.", "get_issue"),
  rs(a => `/repos/${repo(a)}/pulls`, "List pull requests.", "list_pull_requests"), rs(a => `/repos/${repo(a)}/pulls/${n(a,"pull_number")}`, "Read one pull request.", "get_pull_request"),
  rs(a => `/repos/${repo(a)}/commits`, "List commits.", "list_commits"), rs(a => `/repos/${repo(a)}/commits/${encodeURIComponent(String(a.sha))}`, "Read a commit.", "get_commit"),
  rs(a => `/repos/${repo(a)}/branches`, "List branches.", "list_branches"), rs(a => `/repos/${repo(a)}/branches/${encodeURIComponent(String(a.branch))}`, "Read a branch.", "get_branch"), rs(a => `/repos/${repo(a)}/tags`, "List tags.", "list_tags"),
  rs(a => `/repos/${repo(a)}/releases`, "List releases.", "list_releases"), rs(a => `/repos/${repo(a)}/releases/${n(a,"release_id")}`, "Read a release.", "get_release"),
  rs(a => `/repos/${repo(a)}/actions/workflows`, "List Actions workflows.", "list_workflows"), rs(a => `/repos/${repo(a)}/actions/runs`, "List workflow runs.", "list_workflow_runs"), rs(a => `/repos/${repo(a)}/contents/${safePath(a)}`, "Read repository contents.", "get_file"),
  rs(a => `/repos/${repo(a)}/compare/${encodeURIComponent(String(a.base))}...${encodeURIComponent(String(a.head))}`, "Compare commits.", "compare_commits"), rs(a => `/repos/${repo(a)}/collaborators`, "List collaborators.", "list_collaborators"), rs(a => `/repos/${repo(a)}/assignees`, "List assignees.", "list_assignees"), rs(a => `/repos/${repo(a)}/labels`, "List labels.", "list_labels"),
  rs(a => `/repos/${repo(a)}/issues/${n(a,"issue_number")}/comments`, "List issue comments.", "list_issue_comments"), rs(a => `/repos/${repo(a)}/pulls/${n(a,"pull_number")}/comments`, "List pull request comments.", "list_pr_comments"), rs(a => `/repos/${repo(a)}/pulls/${n(a,"pull_number")}/reviews`, "List pull request reviews.", "list_reviews"),
  rs(a => `/repos/${repo(a)}/commits/${encodeURIComponent(String(a.ref))}/check-runs`, "List check runs.", "list_check_runs"), rs(a => `/repos/${repo(a)}/commits/${encodeURIComponent(String(a.ref))}/status`, "Read commit status.", "get_commit_status"), rs(a => `/repos/${repo(a)}/deployments`, "List deployments.", "list_deployments"), rs(a => `/repos/${repo(a)}/forks`, "List forks.", "list_forks"), rs(a => `/repos/${repo(a)}/stargazers`, "List stargazers.", "list_stargazers"), rs(a => `/repos/${repo(a)}/subscribers`, "List watchers.", "list_watchers"),
  // Authenticated user identity and repositories (includes private when the token allows).
  rs(_a => "/user", "Read the authenticated user.", "get_authenticated_user"),
  rs(_a => "/user/repos", "List repositories for the authenticated user (public and private visible to the token). Prefer this over list_user_repositories when enumerating 'my' or Nally's own repos.", "list_my_repositories"),
  rs(a => `/users/${encodeURIComponent(String(a.username))}`, "Read a public user.", "get_user"),
  rs(a => `/users/${encodeURIComponent(String(a.username))}/repos`, "List a user's public repositories. Does not include private repos; use list_my_repositories for the authenticated account.", "list_user_repositories"),
  rs(a => `/orgs/${encodeURIComponent(String(a.org))}/repos`, "List organization repositories.", "list_org_repositories"),
  rs(a => `/users/${encodeURIComponent(String(a.username))}/gists`, "List user gists.", "list_gists"),
  rs(a => `/gists/${encodeURIComponent(String(a.gist_id))}`, "Read a gist.", "get_gist"),
  ws("create_issue", "Create an issue; explicit approval required.", "POST", a => `/repos/${repo(a)}/issues`, a => pick(a,["title","body","labels"])),
  ws("update_issue", "Update an issue; explicit approval required.", "PATCH", a => `/repos/${repo(a)}/issues/${n(a,"issue_number")}`, a => pick(a,["title","body","state","labels","assignees"])),
  ws("create_issue_comment", "Comment on an issue; explicit approval required.", "POST", a => `/repos/${repo(a)}/issues/${n(a,"issue_number")}/comments`, a => ({ body: String(a.body) })),
  ws("create_pull_request", "Create a pull request; explicit approval required.", "POST", a => `/repos/${repo(a)}/pulls`, a => pick(a,["title","body","head","base","draft"])),
  ws("create_gist", "Create a gist; explicit approval required.", "POST", _a => "/gists", a => pick(a,["description","public","files"])),
  ws("update_file", "Create or update a single file; explicit approval required. Prefer push_files when changing multiple files in one commit. Commits are authored as NallyHermes.", "PUT", a => `/repos/${repo(a)}/contents/${safePath(a)}`, a => withNallyAuthor(pick(a,["message","content","sha","branch"]))),
  ws("create_branch", "Create a branch; explicit approval required.", "POST", a => `/repos/${repo(a)}/git/refs`, a => ({ ref: `refs/heads/${String(a.branch)}`, sha: String(a.sha) })),
  ws("create_release", "Create a release; explicit approval required.", "POST", a => `/repos/${repo(a)}/releases`, a => pick(a,["tag_name","name","body","draft","prerelease","target_commitish"])),
  ws("merge_pull_request", "Merge a pull request; explicit approval required.", "PUT", a => `/repos/${repo(a)}/pulls/${n(a,"pull_number")}/merge`, a => pick(a,["commit_title","commit_message","merge_method"]))
];

function definition(name: string): Spec {
  if (name.toLowerCase().includes("delete")) throw new Error("GitHub delete operations are denied by Nally's policy.");
  const found = operations.find(x => x.name === name);
  if (!found) throw new Error(`Unknown GitHub operation: ${name}`);
  return found;
}

function token(): string {
  if (!config.GITHUB_TOKEN) throw new Error("GitHub is not configured. Add GITHUB_TOKEN.");
  return config.GITHUB_TOKEN;
}

async function request(t: string, method: Method, path: string, body?: unknown): Promise<unknown> {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${t}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "NallyHermes-GitHub-Connector",
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(config.GITHUB_TIMEOUT_MS)
  });
  const result = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(
      result && typeof result === "object" && "message" in result
        ? String((result as { message: unknown }).message).slice(0, 500)
        : `GitHub API returned ${r.status}`
    );
  }
  return result;
}

type PushFile = { path: string; content: string };

function parsePushFiles(args: Record<string, unknown>): PushFile[] {
  const raw = args.files;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("push_files requires a non-empty files array.");
  if (raw.length > 50) throw new Error("push_files supports at most 50 files per commit.");
  const files: PushFile[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Each files entry must be an object with path and content.");
    const entry = item as Record<string, unknown>;
    const path = String(entry.path ?? "").replace(/^\/+/, "").trim();
    if (!path || path.includes("..") || path.length > 500) throw new Error("Each file needs a safe relative path.");
    if (typeof entry.content !== "string") throw new Error(`File ${path} is missing string content.`);
    if (entry.content.length > 1_000_000) throw new Error(`File ${path} exceeds the 1MB content limit.`);
    files.push({ path, content: entry.content });
  }
  return files;
}

/**
 * Batch create/update many files in a single commit via the Git Data API.
 * Always authored as NallyHermes.
 */
async function pushFilesBatch(args: Record<string, unknown>): Promise<unknown> {
  const ownerRepo = repo(args);
  const branch = String(args.branch ?? "").trim();
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(branch)) throw new Error("branch is required for push_files.");
  const message = String(args.message ?? "").trim();
  if (!message || message.length > 2000) throw new Error("message is required and must be at most 2000 characters.");
  const files = parsePushFiles(args);
  const t = token();

  const ref = (await request(t, "GET", `/repos/${ownerRepo}/git/ref/heads/${encodeURIComponent(branch)}`)) as { object?: { sha?: string } };
  const headSha = ref.object?.sha;
  if (!headSha) throw new Error(`Could not resolve branch head for ${branch}.`);

  const headCommit = (await request(t, "GET", `/repos/${ownerRepo}/git/commits/${encodeURIComponent(headSha)}`)) as { tree?: { sha?: string } };
  const baseTree = headCommit.tree?.sha;
  if (!baseTree) throw new Error("Could not resolve the base tree for the branch head.");

  const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  for (const file of files) {
    const blob = (await request(t, "POST", `/repos/${ownerRepo}/git/blobs`, {
      content: Buffer.from(file.content, "utf8").toString("base64"),
      encoding: "base64"
    })) as { sha?: string };
    if (!blob.sha) throw new Error(`Failed to create blob for ${file.path}.`);
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = (await request(t, "POST", `/repos/${ownerRepo}/git/trees`, {
    base_tree: baseTree,
    tree: treeEntries
  })) as { sha?: string };
  if (!tree.sha) throw new Error("Failed to create git tree for push_files.");

  const commit = (await request(t, "POST", `/repos/${ownerRepo}/git/commits`, withNallyAuthor({
    message,
    tree: tree.sha,
    parents: [headSha]
  }))) as { sha?: string; html_url?: string; message?: string; author?: unknown; committer?: unknown };
  if (!commit.sha) throw new Error("Failed to create commit for push_files.");

  await request(t, "PATCH", `/repos/${ownerRepo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    sha: commit.sha,
    force: false
  });

  return {
    ok: true,
    branch,
    commit_sha: commit.sha,
    html_url: commit.html_url,
    message: commit.message ?? message,
    files: files.map((file) => file.path),
    author: NALLY_COMMIT_IDENTITY,
    committer: NALLY_COMMIT_IDENTITY
  };
}

export function listGitHubOperations(): GitHubOperationDescription[] {
  const catalog = operations.map(({ name, description, readOnly, inputSchema }) => ({
    name,
    description,
    readOnly,
    inputSchema: structuredClone(inputSchema)
  }));
  catalog.push({
    name: "push_files",
    description:
      "Create or update multiple files in one commit on a branch; explicit approval required. Prefer this over repeated update_file calls. Commits are authored as NallyHermes. Arguments: owner, repo, branch, message, files:[{path,content}].",
    readOnly: false,
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        branch: { type: "string" },
        message: { type: "string" },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: { path: { type: "string" }, content: { type: "string" } },
            required: ["path", "content"]
          }
        }
      },
      required: ["owner", "repo", "branch", "message", "files"]
    }
  });
  return catalog;
}

export function getGitHubOperation(name: string): GitHubOperationDescription {
  if (name === "push_files") {
    return listGitHubOperations().find((item) => item.name === "push_files")!;
  }
  const x = definition(name);
  return { name: x.name, description: x.description, readOnly: x.readOnly, inputSchema: structuredClone(x.inputSchema) };
}

export async function callGitHubOperation(name: string, args: Record<string, unknown>, approved = false): Promise<unknown> {
  if (name === "push_files") {
    if (!config.GITHUB_ALLOW_WRITES || !approved) {
      throw new Error("GitHub write operations require GITHUB_ALLOW_WRITES=true and explicit approval.");
    }
    return pushFilesBatch(args);
  }
  const x = definition(name);
  if (!x.readOnly && (!config.GITHUB_ALLOW_WRITES || !approved)) {
    throw new Error("GitHub write operations require GITHUB_ALLOW_WRITES=true and explicit approval.");
  }
  const path = x.path(args) + (x.method === "GET" ? q(args) : "");
  return request(token(), x.method, path, x.body?.(args));
}
