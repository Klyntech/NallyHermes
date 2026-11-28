import { configuredProviders, isOAuthProvider, PROVIDER_LABEL, telegramStartUrl, type OAuthEnv, type OAuthProvider } from "./oauthWeb.js";

export type LinkButton = { text: string; url: string } | { text: string; data: string };
export type LinkView = { text: string; buttons: LinkButton[] };

export type LinkAccountDeps = {
  env: OAuthEnv;
  createFlow(input: { purpose: "link"; provider: OAuthProvider; telegramId: string; telegramChatId: string }): Promise<{ state: string }>;
  listIdentitiesForTelegramId(telegramId: string): Promise<Array<{ provider: string; email: string | null; displayName: string | null }>>;
};

/** What /linknallyaccount shows: one sign-in button per configured provider, plus unlink for ones already linked. */
export async function buildLinkAccountView(telegramId: string, chatId: string, deps: LinkAccountDeps): Promise<LinkView> {
  const providers = configuredProviders(deps.env);
  if (!providers.length) {
    return {
      text: "Account linking isn't set up on this server yet. The server needs Google and/or GitHub sign-in credentials.",
      buttons: []
    };
  }
  const linked = await deps.listIdentitiesForTelegramId(telegramId);
  const buttons: LinkButton[] = [];
  for (const provider of providers) {
    const already = linked.some((row) => row.provider === provider);
    const { state } = await deps.createFlow({ purpose: "link", provider, telegramId, telegramChatId: chatId });
    buttons.push({ text: `${already ? "Re-link" : "Continue with"} ${PROVIDER_LABEL[provider]}`, url: telegramStartUrl(deps.env, provider, state) });
  }
  for (const row of linked) {
    if (isOAuthProvider(row.provider)) buttons.push({ text: `Unlink ${PROVIDER_LABEL[row.provider]}`, data: `unlink:${row.provider}` });
  }
  const current = linked.length
    ? "\n\nLinked now: " + linked.map((row) => `${PROVIDER_LABEL[row.provider as OAuthProvider] ?? row.provider}${row.email ? ` (${row.email})` : ""}`).join(", ")
    : "";
  return {
    text:
      "Link a login to your Nally account\n\n" +
      "Tap a button, sign in, and you can then open the Nally app with that same login. It will be the same agent, memory and chat as here, with no pairing code." +
      "\n\nThe links work once and expire in 10 minutes. Don't forward them." + current,
    buttons
  };
}

export interface UnlinkStore {
  findUserIdByTelegramId(telegramId: string): Promise<string | null>;
  unlinkUserIdentity(userId: string, provider: string): Promise<boolean>;
}

/** Handles the "Unlink Google/GitHub" button. Only the owner's own chat can unlink. */
export async function handleUnlinkCallback(telegramId: string, provider: string, store: UnlinkStore): Promise<string> {
  if (!telegramId || !isOAuthProvider(provider)) return "That action is not valid.";
  const userId = await store.findUserIdByTelegramId(telegramId);
  if (!userId) return "I couldn't find your account.";
  const removed = await store.unlinkUserIdentity(userId, provider);
  return removed ? `${PROVIDER_LABEL[provider]} unlinked. It can no longer sign in to the app.` : `${PROVIDER_LABEL[provider]} was not linked.`;
}
