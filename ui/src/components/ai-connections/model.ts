import { t as tNewUi } from "@/i18n";
/** Redacted presentation contracts shared with the production API. */
import type { AiProvider, AiAuthMethod, AiManagedConnectionSummary, AiConnectionBinding } from "@paperclipai/shared";
export type { AiProvider, AiAuthMethod, AiConnectionBinding } from "@paperclipai/shared";
export type AiConnectionStatus = AiManagedConnectionSummary["status"];

export const AI_PROVIDERS: Record<
  AiProvider,
  { name: string; subscriptionName?: string; logo?: string }
> = {
  github: { name: "GitHub Copilot", logo: "/brands/apps/github.svg" },
  google: { name: "Google", logo: "/brands/apps/google.svg" },
  anthropic: {
    name: "Claude",
    subscriptionName: tNewUi("newUi.k14e1e91cc1a7"),
    logo: "/brands/claude-color.svg",
  },
  openai: {
    name: "OpenAI",
    subscriptionName: tNewUi("newUi.ka15c38875039"),
    logo: "/brands/codex-color.svg",
  },
  openrouter: { name: "OpenRouter", logo: "/brands/apps/openrouter.svg" },
  xai: {
    name: "Grok",
    subscriptionName: tNewUi("newUi.k2fabfe6d95c2"),
    logo: "/brands/adapters/grok.svg",
  },
};

export type AiConnectionSummary = Omit<AiManagedConnectionSummary, "isDefault"> & { isDefault?: boolean };

export interface AiConnectionRequirement {
  companyId: string;
  provider: AiProvider;
  method?: AiAuthMethod;
}

export const AI_CONNECTION_STATUS: Record<AiConnectionStatus, string> = {
  connected: tNewUi("newUi.k22965568d22a"),
  needs_attention: tNewUi("newUi.kc1ebc7817870"),
  expired: tNewUi("newUi.k424a2551d356"),
  revoked: tNewUi("newUi.kf6f738d04392"),
};

export function defaultAiConnectionName(ownerName: string | undefined, provider: AiProvider, method: AiAuthMethod) {
  const owner = ownerName?.trim();
  const prefix = owner && owner !== "You" ? `${owner}'s` : "My";
  const providerName = method === "subscription"
    ? AI_PROVIDERS[provider].subscriptionName ?? AI_PROVIDERS[provider].name
    : `${AI_PROVIDERS[provider].name} API`;
  return `${prefix} ${providerName} account`;
}

export function aiMethodLabel(provider: AiProvider, method: AiAuthMethod) {
  return method === "subscription"
    ? (AI_PROVIDERS[provider].subscriptionName ?? tNewUi("newUi.kbc3442fff4d2"))
    : provider === "github" ? tNewUi("upgrade1029ConflictsB.aiConnections.personalAccessToken") : tNewUi("newUi.k16f0ee47f993");
}

export function aiConnectionDisplayLabel(connection: AiConnectionSummary) {
  const personal = connection.ownership === "personal";
  return [
    connection.name,
    aiMethodLabel(connection.provider, connection.method),
    personal ? tNewUi("newUi.k845f9286400f") : tNewUi("newUi.k47e5dc161731"),
    connection.accountLabel || connection.ownerName,
  ].filter(Boolean).join(" · ");
}

export function matchesAiRequirement(
  connection: AiConnectionSummary,
  requirement: AiConnectionRequirement,
) {
  return (
    connection.companyId === requirement.companyId &&
    connection.provider === requirement.provider &&
    (requirement.method === undefined || connection.method === requirement.method)
  );
}

export function personalAiDefault(
  connections: AiConnectionSummary[],
  requirement: AiConnectionRequirement,
  userId: string,
) {
  // Never choose another account because the declared default is unhealthy.
  return connections.find(
    (connection) =>
      matchesAiRequirement(connection, { ...requirement, method: undefined }) &&
      connection.ownership === "personal" &&
      connection.ownerUserId === userId &&
      connection.isDefault,
  );
}

export function aiConnectionProblem(connection?: AiConnectionSummary) {
  if (!connection)
    return tNewUi("newUi.ka293762d06b3");
  return (
    connection.unavailableReason ??
    (connection.status === "connected"
      ? null
      : `${AI_CONNECTION_STATUS[connection.status]}. Reconnect this account to continue.`)
  );
}

export function bindingProblem(
  binding: AiConnectionBinding,
  requirement: AiConnectionRequirement,
  connections: AiConnectionSummary[],
  userId: string,
  _agentId: string,
) {
  if (
    binding.provider !== requirement.provider ||
    (binding.mode !== "responsible_user" && requirement.method !== undefined && binding.method !== requirement.method)
  )
    return tNewUi("newUi.k7d05bd9feeff");
  if (binding.mode === "responsible_user")
    return aiConnectionProblem(
      personalAiDefault(connections, requirement, userId),
    );
  const connection = connections.find(
    (item) =>
      item.id === binding.connectionId &&
      item.grantId === binding.grantId &&
      item.method === binding.method &&
      matchesAiRequirement(item, requirement),
  );
  if (!connection)
    return tNewUi("newUi.kf7e1831485cf");
  if (binding.mode === "shared" && connection.ownership !== "shared")
    return tNewUi("newUi.k1f8359099ef6");
  if (
    binding.mode === "delegated" &&
    (connection.ownership !== "personal" ||
      connection.ownerUserId !== userId)
  )
    return tNewUi("newUi.k4b3447ca431a");
  return aiConnectionProblem(connection);
}
