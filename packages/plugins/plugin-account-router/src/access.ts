import type { PluginContext, PluginPerformActionContext } from "@paperclipai/plugin-sdk";

export type AccessDenialReason =
  | "board_user_required"
  | "company_scope_required"
  | "company_mismatch"
  | "company_not_enabled";

export class AccessDeniedError extends Error {
  readonly reason: AccessDenialReason;

  constructor(reason: AccessDenialReason) {
    super(`account router access denied: ${reason}`);
    this.name = "AccessDeniedError";
    this.reason = reason;
  }
}

export interface AuthorizedReader {
  companyId: string;
  /** The enabled company's plugin config, already read by the gate. */
  config: Record<string, unknown>;
}

/**
 * Fail-closed caller gate for every read.
 *
 * Identity comes only from the host-built action context: the bridge route
 * authenticates the request, checks company access for the requested
 * company, and then sets `actor` itself. Caller params are never trusted for
 * identity or company. On top of that, the company must be explicitly enabled
 * in this plugin's company config, which only an instance admin can write.
 * Because the plugin is installed instance-wide, the default for every
 * company is "no access".
 */
export async function authorizeReader(
  ctx: PluginContext,
  params: Record<string, unknown>,
  context: PluginPerformActionContext,
): Promise<AuthorizedReader> {
  const actor = context.actor;
  if (actor.type !== "user" || !actor.userId) {
    throw new AccessDeniedError("board_user_required");
  }

  const companyId = actor.companyId;
  if (!companyId) {
    throw new AccessDeniedError("company_scope_required");
  }

  if (params.companyId !== undefined && params.companyId !== companyId) {
    throw new AccessDeniedError("company_mismatch");
  }

  let config: Record<string, unknown>;
  try {
    config = await ctx.config.get(companyId);
  } catch {
    // Plugin disabled for this company, or config unreadable: deny.
    throw new AccessDeniedError("company_not_enabled");
  }
  if (config?.enabled !== true) {
    throw new AccessDeniedError("company_not_enabled");
  }

  return { companyId, config };
}
