import { config } from "../config.js";

export type VerifiedOAuthIdentity = {
  provider: "google" | "github";
  providerUserId: string;
  email: string | null;
  displayName: string | null;
};

export class OAuthVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthVerificationError";
  }
}

/**
 * Verify a Google ID token via Google's tokeninfo endpoint and ensure the
 * audience matches our configured OAuth client ID when set.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedOAuthIdentity> {
  const token = idToken.trim();
  if (token.length < 40 || token.length > 8_192) {
    throw new OAuthVerificationError("Invalid Google ID token.");
  }
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new OAuthVerificationError("Google could not verify that ID token.");
  }
  const payload = await response.json() as Record<string, unknown>;
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : null;
  const name = typeof payload.name === "string" ? payload.name : null;
  const aud = typeof payload.aud === "string" ? payload.aud : "";
  const emailVerified = payload.email_verified === "true" || payload.email_verified === true;
  if (!sub) {
    throw new OAuthVerificationError("Google token is missing a subject.");
  }
  const expectedAud = config.GOOGLE_OAUTH_CLIENT_ID;
  if (expectedAud && aud !== expectedAud) {
    throw new OAuthVerificationError("Google token audience does not match this app.");
  }
  if (email && !emailVerified) {
    throw new OAuthVerificationError("Google email is not verified.");
  }
  return {
    provider: "google",
    providerUserId: sub,
    email,
    displayName: name
  };
}

/**
 * Resolve the GitHub user for a personal access token or OAuth user-access token.
 */
export async function verifyGitHubAccessToken(accessToken: string): Promise<VerifiedOAuthIdentity> {
  const token = accessToken.trim();
  if (token.length < 20 || token.length > 512) {
    throw new OAuthVerificationError("Invalid GitHub access token.");
  }
  const response = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "NallyHermes-Mobile"
    }
  });
  if (!response.ok) {
    throw new OAuthVerificationError("GitHub could not verify that access token.");
  }
  const user = await response.json() as Record<string, unknown>;
  const id = user.id != null ? String(user.id) : "";
  const login = typeof user.login === "string" ? user.login : null;
  let email = typeof user.email === "string" ? user.email : null;
  if (!email) {
    try {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": "NallyHermes-Mobile"
        }
      });
      if (emailsRes.ok) {
        const emails = await emailsRes.json() as Array<Record<string, unknown>>;
        const primary = emails.find((row) => row.primary === true && row.verified === true)
          ?? emails.find((row) => row.verified === true);
        if (primary && typeof primary.email === "string") email = primary.email;
      }
    } catch {
      // optional
    }
  }
  if (!id) {
    throw new OAuthVerificationError("GitHub token is missing a user id.");
  }
  return {
    provider: "github",
    providerUserId: id,
    email,
    displayName: login
  };
}
