/**
 * Nally Account User UI
 * Reflects backend: nally_accounts, account_identities, account_sessions
 * Supports current Telegram users via "Continue with Telegram" path.
 *
 * When real APIs exist, replace MockApi with fetch calls to /api/account/*
 */

// ─── Types mirrored from src/db/schema-accounts.ts ───────────────────────────

/**
 * @typedef {Object} NallyAccount
 * @property {string} id
 * @property {string|null} handle
 * @property {string|null} displayName
 * @property {string|null} email
 * @property {string|null} emailVerifiedAt
 * @property {string} timezone
 * @property {string} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} AccountIdentity
 * @property {string} id
 * @property {string} accountId
 * @property {string} provider
 * @property {string} providerUserId
 * @property {string|null} providerUsername
 * @property {Record<string, unknown>} metadata
 * @property {string} linkedAt
 */

/**
 * @typedef {Object} AccountSession
 * @property {string} id
 * @property {string} accountId
 * @property {string} expiresAt
 * @property {string|null} revokedAt
 * @property {string} createdAt
 * @property {string|null} lastSeenAt
 * @property {string|null} userAgent
 * @property {string|null} ipHint
 */

// ─── Mock API (replace with real backend) ────────────────────────────────────

const STORAGE_KEY = "nally_account_demo_v1";

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    account: null,
    identities: [],
    sessions: [],
    token: null,
  };
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

/** Simulates backend shaped like schema-accounts + session helpers */
const MockApi = {
  async getSession() {
    const store = loadStore();
    if (!store.token || !store.account) return null;
    const session = store.sessions.find(
      (s) => s.id === store.token.sessionId && !s.revokedAt
    );
    if (!session || new Date(session.expiresAt) < new Date()) return null;
    return { account: store.account, session, identities: store.identities };
  },

  /**
   * Current-user path: Telegram identity → Nally Account
   * Mirrors migrate-telegram-users + createAccountSession
   */
  async continueWithTelegram({ telegramId, username, firstName, timezone }) {
    const store = loadStore();
    let account = store.account;
    let identities = store.identities;

    // Find existing telegram identity (idempotent like migration)
    const existing = identities.find(
      (i) => i.provider === "telegram" && i.providerUserId === telegramId
    );

    if (existing && account?.id === existing.accountId) {
      // Already linked — just issue session
    } else if (existing) {
      account = store.account; // should match
    } else {
      // Create Nally Account (Phase-1 migration shape)
      account = {
        id: uid(),
        handle: null,
        displayName: firstName || username || null,
        email: null,
        emailVerifiedAt: null,
        timezone: timezone || "Africa/Lagos",
        status: "active",
        createdAt: nowIso(),
      };
      const identity = {
        id: uid(),
        accountId: account.id,
        provider: "telegram",
        providerUserId: String(telegramId),
        providerUsername: username || null,
        metadata: { legacy_path: "continue_with_telegram", migrated_at: nowIso() },
        linkedAt: nowIso(),
      };
      identities = [...identities.filter((i) => i.accountId !== account.id), identity];
    }

    const session = {
      id: uid(),
      accountId: account.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      userAgent: navigator.userAgent.slice(0, 120),
      ipHint: null,
    };

    const token = { sessionId: session.id, raw: "demo_" + uid().slice(0, 12) };
    store.account = account;
    store.identities = identities;
    store.sessions = [...store.sessions.filter((s) => s.accountId !== account.id || s.revokedAt), session];
    store.token = token;
    saveStore(store);

    return { account, session, identities, token: token.raw };
  },

  /** Fresh Nally Account (no provider yet) — true Login with Nally start */
  async createNallyAccount({ displayName, handle }) {
    const store = loadStore();
    const normalizedHandle = handle
      ? handle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32)
      : null;

    if (normalizedHandle && normalizedHandle.length < 3) {
      throw new Error("Handle must be at least 3 characters");
    }

    const account = {
      id: uid(),
      handle: normalizedHandle,
      displayName: displayName || null,
      email: null,
      emailVerifiedAt: null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos",
      status: "active",
      createdAt: nowIso(),
    };

    const session = {
      id: uid(),
      accountId: account.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      revokedAt: null,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      userAgent: navigator.userAgent.slice(0, 120),
      ipHint: null,
    };

    const token = { sessionId: session.id, raw: "demo_" + uid().slice(0, 12) };
    store.account = account;
    store.identities = [];
    store.sessions = [session];
    store.token = token;
    saveStore(store);

    return { account, session, identities: [], token: token.raw };
  },

  async updateProfile({ displayName, handle }) {
    const store = loadStore();
    if (!store.account) throw new Error("Not signed in");

    const normalizedHandle = handle
      ? handle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32)
      : null;

    if (normalizedHandle && normalizedHandle.length > 0 && normalizedHandle.length < 3) {
      throw new Error("Handle must be at least 3 characters");
    }

    store.account = {
      ...store.account,
      displayName: displayName ?? store.account.displayName,
      handle: normalizedHandle === "" ? null : normalizedHandle ?? store.account.handle,
    };
    saveStore(store);
    return store.account;
  },

  async linkProvider(provider, providerUserId, providerUsername) {
    const store = loadStore();
    if (!store.account) throw new Error("Not signed in");

    if (store.identities.some((i) => i.provider === provider && i.providerUserId === providerUserId)) {
      return store.identities;
    }

    const identity = {
      id: uid(),
      accountId: store.account.id,
      provider,
      providerUserId: String(providerUserId),
      providerUsername: providerUsername || null,
      metadata: {},
      linkedAt: nowIso(),
    };
    store.identities = [...store.identities, identity];
    saveStore(store);
    return store.identities;
  },

  async unlinkProvider(identityId) {
    const store = loadStore();
    store.identities = store.identities.filter((i) => i.id !== identityId);
    saveStore(store);
    return store.identities;
  },

  async listSessions() {
    const store = loadStore();
    if (!store.account) return [];
    return store.sessions
      .filter((s) => s.accountId === store.account.id && !s.revokedAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async revokeSession(sessionId) {
    const store = loadStore();
    store.sessions = store.sessions.map((s) =>
      s.id === sessionId ? { ...s, revokedAt: nowIso() } : s
    );
    if (store.token?.sessionId === sessionId) {
      store.token = null;
      store.account = null;
    }
    saveStore(store);
  },

  async signOut() {
    const store = loadStore();
    if (store.token) {
      store.sessions = store.sessions.map((s) =>
        s.id === store.token.sessionId ? { ...s, revokedAt: nowIso() } : s
      );
    }
    store.token = null;
    // Keep account + identities in local demo store for re-login demos
    saveStore(store);
  },

  /** Demo: simulate existing Telegram user already in backend */
  async demoExistingTelegramUser() {
    return this.continueWithTelegram({
      telegramId: "123456789",
      username: "clinton",
      firstName: "Clinton",
      timezone: "Africa/Lagos",
    });
  },
};

// ─── App state ───────────────────────────────────────────────────────────────

let state = {
  view: "loading", // loading | login | account | linked | sessions | edit
  account: null,
  identities: [],
  sessions: [],
  error: null,
  busy: false,
};

// ─── Render ──────────────────────────────────────────────────────────────────

const app = document.getElementById("app");

function initials(name, handle) {
  const s = (name || handle || "N").trim();
  return s.slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function providerLabel(p) {
  const map = {
    telegram: "Telegram",
    google: "Google",
    samsung: "Samsung",
    apple: "Apple",
    xai: "xAI",
    email: "Email",
  };
  return map[p] || p;
}

function providerShort(p) {
  return (p || "?").slice(0, 2).toUpperCase();
}

function render() {
  if (state.view === "loading") {
    app.innerHTML = `<div class="brand"><div class="brand-mark">N</div><p class="muted">Loading…</p></div>`;
    return;
  }

  if (state.view === "login") {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }

  if (state.view === "account") {
    app.innerHTML = renderAccount();
    bindAccount();
    return;
  }

  if (state.view === "linked") {
    app.innerHTML = renderLinked();
    bindLinked();
    return;
  }

  if (state.view === "sessions") {
    app.innerHTML = renderSessions();
    bindSessions();
    return;
  }

  if (state.view === "edit") {
    app.innerHTML = renderEdit();
    bindEdit();
    return;
  }
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function renderLogin() {
  return `
    <div class="brand">
      <div class="brand-mark">N</div>
      <div class="brand-title">Nally Account</div>
      <p class="brand-sub">One identity for Nally. Login with Nally anywhere.</p>
    </div>

    <div class="stack stack-lg">
      ${state.error ? `<div class="banner">${escapeHtml(state.error)}</div>` : ""}

      <button class="btn btn-primary" id="btn-login-nally" ${state.busy ? "disabled" : ""}>
        Login with Nally
      </button>

      <div class="divider">or continue with</div>

      <button class="btn btn-secondary" id="btn-telegram" ${state.busy ? "disabled" : ""}>
        Continue with Telegram
      </button>
      <button class="btn btn-secondary" id="btn-google" disabled title="Coming soon">
        Continue with Google
      </button>

      <p class="faint center">
        Current Nally users: use <strong>Continue with Telegram</strong> —
        your existing chat identity becomes a Nally Account automatically.
      </p>
    </div>
  `;
}

function renderAccount() {
  const a = state.account;
  const handle = a.handle ? `@${a.handle}` : null;
  const name = a.displayName || handle || "Nally user";
  const telegram = state.identities.find((i) => i.provider === "telegram");

  return `
    <div class="topbar">
      <span class="h2">Account</span>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" id="btn-signout">Sign out</button>
    </div>

    <div class="stack stack-lg">
      <div class="card card-elevated center stack stack-sm">
        <div class="avatar" style="margin: 0 auto">${escapeHtml(initials(a.displayName, a.handle))}</div>
        <div class="h1">${escapeHtml(name)}</div>
        ${handle ? `<div class="handle">${escapeHtml(handle)}</div>` : `<div class="faint">No handle yet</div>`}
        <div class="pill pill-success" style="align-self: center">${escapeHtml(a.status)}</div>
        ${telegram ? `<p class="faint">Linked Telegram · ${escapeHtml(telegram.providerUsername || telegram.providerUserId)}</p>` : ""}
      </div>

      <div class="card stack stack-sm">
        <button class="btn btn-secondary" id="btn-edit">Edit profile</button>
        <button class="btn btn-secondary" id="btn-linked">Linked identities</button>
        <button class="btn btn-secondary" id="btn-sessions">Sessions</button>
      </div>

      <div class="banner banner-info">
        Backend model: <code>nally_accounts</code> + <code>account_identities</code> + <code>account_sessions</code>.
        This UI talks to the same shapes.
      </div>
    </div>
  `;
}

function renderLinked() {
  const providers = ["telegram", "google", "samsung", "apple"];
  const byProvider = Object.fromEntries(
    state.identities.map((i) => [i.provider, i])
  );

  const rows = providers
    .map((p) => {
      const linked = byProvider[p];
      return `
        <div class="identity-row">
          <div class="provider-icon ${linked ? "linked" : ""}">${providerShort(p)}</div>
          <div class="spacer">
            <div>${providerLabel(p)}</div>
            <div class="faint">${linked ? escapeHtml(linked.providerUsername || linked.providerUserId) : "Not linked"}</div>
          </div>
          ${
            linked
              ? `<span class="pill pill-success">Linked</span>
                 <button class="btn btn-ghost btn-sm" data-unlink="${linked.id}">Unlink</button>`
              : `<button class="btn btn-secondary btn-sm" data-link="${p}">Connect</button>`
          }
        </div>
      `;
    })
    .join("");

  return `
    <div class="topbar">
      <button class="back-btn" id="btn-back">← Back</button>
      <span class="h2">Linked identities</span>
    </div>

    <p class="muted" style="margin-bottom: 16px">
      These are ways to unlock your Nally Account. Telegram is how current users enter.
    </p>

    <div class="card">
      ${rows}
    </div>
  `;
}

function renderSessions() {
  const rows =
    state.sessions.length === 0
      ? `<p class="faint">No active sessions</p>`
      : state.sessions
          .map(
            (s) => `
        <div class="session-row">
          <div class="row-between">
            <div>
              <div>Session</div>
              <div class="faint">Created ${formatDate(s.createdAt)}</div>
              <div class="faint">Expires ${formatDate(s.expiresAt)}</div>
            </div>
            <button class="btn btn-danger btn-sm" data-revoke="${s.id}">Revoke</button>
          </div>
        </div>
      `
          )
          .join("");

  return `
    <div class="topbar">
      <button class="back-btn" id="btn-back">← Back</button>
      <span class="h2">Sessions</span>
    </div>
    <div class="card">${rows}</div>
  `;
}

function renderEdit() {
  const a = state.account;
  return `
    <div class="topbar">
      <button class="back-btn" id="btn-back">← Back</button>
      <span class="h2">Edit profile</span>
    </div>

    <div class="stack">
      ${state.error ? `<div class="banner">${escapeHtml(state.error)}</div>` : ""}

      <div>
        <label class="label" for="displayName">Display name</label>
        <input class="input" id="displayName" value="${escapeAttr(a.displayName || "")}" placeholder="Clinton" />
      </div>

      <div>
        <label class="label" for="handle">Handle</label>
        <input class="input" id="handle" value="${escapeAttr(a.handle || "")}" placeholder="clinton" />
        <p class="faint" style="margin-top: 6px">Shown as @handle · 3–32 chars, a-z 0-9 _</p>
      </div>

      <button class="btn btn-primary" id="btn-save" ${state.busy ? "disabled" : ""}>Save</button>
    </div>
  `;
}

// ─── Bindings ────────────────────────────────────────────────────────────────

function bindLogin() {
  document.getElementById("btn-login-nally")?.addEventListener("click", async () => {
    state.busy = true;
    state.error = null;
    render();
    try {
      // Demo: create a fresh Nally Account (true Login with Nally path)
      const res = await MockApi.createNallyAccount({
        displayName: "Clinton",
        handle: "clinton",
      });
      state.account = res.account;
      state.identities = res.identities;
      state.sessions = await MockApi.listSessions();
      state.view = "account";
    } catch (e) {
      state.error = e.message || String(e);
    } finally {
      state.busy = false;
      render();
    }
  });

  document.getElementById("btn-telegram")?.addEventListener("click", async () => {
    state.busy = true;
    state.error = null;
    render();
    try {
      // Current-user path: existing Telegram identity → Nally Account
      const res = await MockApi.demoExistingTelegramUser();
      state.account = res.account;
      state.identities = res.identities;
      state.sessions = await MockApi.listSessions();
      state.view = "account";
    } catch (e) {
      state.error = e.message || String(e);
    } finally {
      state.busy = false;
      render();
    }
  });
}

function bindAccount() {
  document.getElementById("btn-signout")?.addEventListener("click", async () => {
    await MockApi.signOut();
    state.account = null;
    state.identities = [];
    state.sessions = [];
    state.view = "login";
    render();
  });
  document.getElementById("btn-edit")?.addEventListener("click", () => {
    state.view = "edit";
    state.error = null;
    render();
  });
  document.getElementById("btn-linked")?.addEventListener("click", () => {
    state.view = "linked";
    render();
  });
  document.getElementById("btn-sessions")?.addEventListener("click", async () => {
    state.sessions = await MockApi.listSessions();
    state.view = "sessions";
    render();
  });
}

function bindLinked() {
  document.getElementById("btn-back")?.addEventListener("click", () => {
    state.view = "account";
    render();
  });

  document.querySelectorAll("[data-link]").forEach((el) => {
    el.addEventListener("click", async () => {
      const provider = el.getAttribute("data-link");
      // Demo link — real flow would OAuth redirect
      state.identities = await MockApi.linkProvider(
        provider,
        `demo_${provider}_user`,
        provider === "google" ? "clinton@gmail.com" : null
      );
      render();
      bindLinked();
    });
  });

  document.querySelectorAll("[data-unlink]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-unlink");
      state.identities = await MockApi.unlinkProvider(id);
      render();
      bindLinked();
    });
  });
}

function bindSessions() {
  document.getElementById("btn-back")?.addEventListener("click", () => {
    state.view = "account";
    render();
  });

  document.querySelectorAll("[data-revoke]").forEach((el) => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-revoke");
      await MockApi.revokeSession(id);
      const stillIn = await MockApi.getSession();
      if (!stillIn) {
        state.account = null;
        state.view = "login";
      } else {
        state.sessions = await MockApi.listSessions();
      }
      render();
    });
  });
}

function bindEdit() {
  document.getElementById("btn-back")?.addEventListener("click", () => {
    state.view = "account";
    state.error = null;
    render();
  });

  document.getElementById("btn-save")?.addEventListener("click", async () => {
    state.busy = true;
    state.error = null;
    render();
    try {
      const displayName = document.getElementById("displayName")?.value?.trim() || null;
      const handle = document.getElementById("handle")?.value?.trim() || null;
      state.account = await MockApi.updateProfile({ displayName, handle });
      state.view = "account";
    } catch (e) {
      state.error = e.message || String(e);
    } finally {
      state.busy = false;
      render();
    }
  });
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

// ─── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  const session = await MockApi.getSession();
  if (session) {
    state.account = session.account;
    state.identities = session.identities;
    state.sessions = await MockApi.listSessions();
    state.view = "account";
  } else {
    state.view = "login";
  }
  render();
}

boot();
