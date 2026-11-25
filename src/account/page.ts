export const accountPage = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <title>Nally Account</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: Canvas; color: CanvasText; }
    main { width: min(100%, 420px); padding: 32px; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 18px; }
    h1 { margin: 0 0 8px; font-size: 28px; } p { line-height: 1.5; opacity: .78; }
    label { display: block; margin: 24px 0 8px; font-size: 14px; font-weight: 600; }
    input { width: 100%; padding: 13px 14px; border: 1px solid color-mix(in srgb, CanvasText 25%, transparent); border-radius: 9px; background: Canvas; color: CanvasText; font: inherit; }
    button { width: 100%; margin-top: 14px; padding: 13px; border: 0; border-radius: 9px; background: CanvasText; color: Canvas; font: inherit; font-weight: 650; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    #status { min-height: 48px; margin-top: 18px; font-size: 14px; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>Nally Account</h1>
    <p>Sign in with a one-time link sent to your email address.</p>
    <form id="login-form">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required>
      <button id="submit" type="submit">Email me a sign-in link</button>
    </form>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script>
    const form = document.getElementById("login-form");
    const status = document.getElementById("status");
    const button = document.getElementById("submit");
    const token = new URLSearchParams(location.search).get("token");
    if (location.pathname === "/account/verify" && token) {
      history.replaceState(null, "", "/account/verify");
      form.hidden = true;
      status.textContent = "Verifying your sign-in link…";
      fetch("/api/account/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token })
      }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "This link is invalid or expired.");
        status.textContent = "You are signed in to Nally Account.";
      }).catch(error => {
        status.textContent = error.message || "Unable to verify this link.";
        form.hidden = false;
      });
    } else {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        button.disabled = true;
        status.textContent = "Requesting your sign-in link…";
        try {
          const response = await fetch("/api/account/magic-link", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ email: document.getElementById("email").value })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Unable to request a sign-in link.");
          status.textContent = data.message || "Check your inbox for a sign-in link.";
        } catch (error) {
          status.textContent = error.message || "Unable to request a sign-in link.";
        } finally {
          button.disabled = false;
        }
      });
    }
  </script>
</body>
</html>`;
