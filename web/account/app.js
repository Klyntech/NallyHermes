const TOKEN_KEY = "nally_account_access_token";
const app = document.querySelector("#app");
const token = () => sessionStorage.getItem(TOKEN_KEY);
const setToken = value => value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY);

let account = null;
let busy = false;
let errorMessage = "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function api(path, options = {}, authenticated = false) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (authenticated && token()) headers.authorization = `Bearer ${token()}`;
  const response = await fetch(path, { ...options, headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function renderLogin(mode = "login") {
  const registering = mode === "register";
  app.innerHTML = `
    <section class="shell">
      <header class="brand">
        <div class="brand-mark">N</div>
        <p class="eyebrow">YOUR NALLY IDENTITY</p>
        <h1>${registering ? "Create your Nally Account" : "Login with Nally"}</h1>
        <p class="subhead">One account for your Nally experience.</p>
      </header>
      <form id="account-form" class="panel">
        ${errorMessage ? `<div class="notice error">${escapeHtml(errorMessage)}</div>` : ""}
        ${registering ? `
          <label>Display name<input name="displayName" autocomplete="name" maxlength="80" placeholder="Your name"></label>
          <label>Username <span class="muted">(optional)</span><input name="username" autocomplete="username" minlength="3" maxlength="32" placeholder="your_handle"></label>
        ` : ""}
        <label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label>
        <label>Password<input name="password" type="password" autocomplete="${registering ? "new-password" : "current-password"}" required minlength="12" maxlength="256" placeholder="At least 12 characters"></label>
        <button class="primary" type="submit" ${busy ? "disabled" : ""}>${busy ? "Please wait…" : registering ? "Create account" : "Sign in"}</button>
        <p class="switch">${registering ? "Already have an account?" : "New to Nally?"}
          <button type="button" class="text-button" id="switch-mode">${registering ? "Sign in" : "Create an account"}</button>
        </p>
      </form>
      <div class="or"><span>or</span></div>
      <button class="secondary" id="telegram-button" ${busy ? "disabled" : ""}>Continue with Telegram</button>
      <p class="fineprint">Email verification and password recovery are not available yet. This account interface is an early release.</p>
    </section>`;

  document.querySelector("#switch-mode").addEventListener("click", () => {
    errorMessage = "";
    renderLogin(registering ? "login" : "register");
  });
  document.querySelector("#account-form").addEventListener("submit", event => submitCredentials(event, registering));
  document.querySelector("#telegram-button").addEventListener("click", () => startTelegram("login"));
}

async function submitCredentials(event, registering) {
  event.preventDefault();
  if (busy) return;
  busy = true;
  errorMessage = "";
  const form = new FormData(event.currentTarget);
  const payload = {
    email: String(form.get("email") || "").trim(),
    password: String(form.get("password") || "")
  };
  if (registering) {
    payload.displayName = String(form.get("displayName") || "").trim();
    payload.username = String(form.get("username") || "").trim();
  }
  renderLogin(registering ? "register" : "login");
  try {
    const result = await api(registering ? "/api/accounts/register" : "/api/accounts/login", {
      method: "POST", body: JSON.stringify(payload)
    });
    setToken(result.accessToken);
    await loadAccount();
  } catch (error) {
    errorMessage = error.message;
    renderLogin(registering ? "register" : "login");
  } finally {
    busy = false;
  }
}

async function startTelegram(action) {
  try {
    const challenge = await api("/api/accounts/telegram/challenge", { method: "POST", body: "{}" });
    const state = crypto.randomUUID();
    sessionStorage.setItem("nally_telegram_flow", JSON.stringify({
      action, nonce: challenge.nonce, state
    }));
    const redirect = new URL("https://oauth.telegram.org/auth");
    redirect.search = new URLSearchParams({
      client_id: challenge.clientId,
      redirect_uri: challenge.redirectUri,
      response_type: "id_token",
      scope: Array.isArray(challenge.scopes) ? challenge.scopes.join(" ") : "openid profile",
      nonce: challenge.nonce,
      state
    }).toString();
    window.location.assign(redirect.toString());
  } catch (error) {
    errorMessage = error.message;
    renderLogin();
  }
}

async function finishTelegramCallback() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const idToken = hash.get("id_token");
  const flow = JSON.parse(sessionStorage.getItem("nally_telegram_flow") || "null");
  if (!idToken || !flow || hash.get("state") !== flow.state) {
    errorMessage = hash.get("error_description") || "Telegram sign-in could not be completed. Please try again.";
    history.replaceState(null, "", "/account");
    renderLogin();
    return;
  }
  try {
    const endpoint = flow.action === "link"
      ? "/api/accounts/telegram/link" : "/api/accounts/telegram/login";
    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ idToken, nonce: flow.nonce })
    }, flow.action === "link");
    if (flow.action === "login") setToken(result.accessToken);
    sessionStorage.removeItem("nally_telegram_flow");
    history.replaceState(null, "", "/account");
    await loadAccount();
  } catch (error) {
    sessionStorage.removeItem("nally_telegram_flow");
    history.replaceState(null, "", "/account");
    errorMessage = error.message;
    renderLogin();
  }
}

async function loadAccount() {
  try {
    account = await api("/api/accounts/me", { method: "GET" }, true);
    renderAccount();
  } catch {
    setToken(null);
    account = null;
    renderLogin();
  }
}

function renderAccount() {
  const identities = Array.isArray(account.identities) ? account.identities : [];
  const telegram = identities.find(item => item.provider === "telegram");
  const initials = (account.displayName || account.username || "N").slice(0, 2).toUpperCase();
  app.innerHTML = `
    <section class="shell">
      <div class="topbar"><span class="eyebrow">NALLY ACCOUNT</span><button id="signout" class="text-button">Sign out</button></div>
      <header class="profile">
        <div class="avatar">${escapeHtml(initials)}</div>
        <h1>${escapeHtml(account.displayName || "Nally user")}</h1>
        <p class="handle">${account.username ? "@" + escapeHtml(account.username) : "Username not set"}</p>
        <span class="status">${escapeHtml(account.status || "active")}</span>
      </header>
      <section class="panel details">
        <div class="detail"><span>Email</span><strong>${escapeHtml(account.email || "Not added")}</strong></div>
        <div class="detail"><span>Account ID</span><strong class="mono">${escapeHtml(account.id)}</strong></div>
        <div class="detail"><span>Created</span><strong>${account.createdAt ? escapeHtml(new Date(account.createdAt).toLocaleDateString()) : "—"}</strong></div>
      </section>
      <section class="panel">
        <div class="section-heading"><h2>Linked identities</h2><span class="muted">${identities.length} linked</span></div>
        <div class="identity">
          <div><strong>Telegram</strong><p class="muted">${telegram ? "Connected to this account" : "Not connected"}</p></div>
          <button id="telegram-link" class="small-button">${telegram ? "Connected" : "Link Telegram"}</button>
        </div>
      </section>
      <p class="fineprint">Account controls are being expanded. Session management, email verification and password recovery are not yet available in this release.</p>
    </section>`;
  document.querySelector("#signout").addEventListener("click", signOut);
  document.querySelector("#telegram-link").addEventListener("click", () => {
    if (!telegram) startTelegram("link");
  });
}

async function signOut() {
  try { await api("/api/accounts/session", { method: "DELETE" }, true); }
  catch {}
  setToken(null);
  account = null;
  renderLogin();
}

async function boot() {
  if (window.location.hash.includes("id_token=")) {
    await finishTelegramCallback();
    return;
  }
  if (token()) await loadAccount();
  else renderLogin();
}
boot();
