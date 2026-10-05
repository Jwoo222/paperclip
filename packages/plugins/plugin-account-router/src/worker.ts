import { definePlugin, runWorker, type PluginContext, type PluginPerformActionContext } from "@paperclipai/plugin-sdk";
import { AccessDeniedError, authorizeReader, type AuthorizedReader } from "./access.js";
import { ROUTER_HEALTH_ACTION, ROUTER_LINK_ACTION, ROUTER_STATE_ACTION } from "./manifest.js";
import { safeRouterUrl } from "./router-url.js";
import {
  createRouterClient,
  RouterReadError,
  type RouterClient,
  type RouterReadFailure,
} from "./router-client.js";
import { sanitizeHealth, sanitizeState, type RouterHealth, type RouterStateSummary } from "./sanitize.js";

const PLUGIN_NAME = "account-router";

export interface RouterUnavailable {
  connection: "offline" | "error";
  reason: RouterReadFailure;
  checkedAt: string;
}

export type HealthResult = RouterHealth | RouterUnavailable;
export type StateResult = RouterStateSummary | RouterUnavailable;

export interface RouterLinkResult {
  /** Validated router UI address from company config, or null when unset/invalid. */
  routerUrl: string | null;
}

function unavailable(error: unknown): RouterUnavailable {
  const reason: RouterReadFailure = error instanceof RouterReadError ? error.code : "schema_mismatch";
  return {
    connection: reason === "offline" || reason === "timeout" ? "offline" : "error",
    reason,
    checkedAt: new Date().toISOString(),
  };
}

type ReadHandler = (params: Record<string, unknown>, context: PluginPerformActionContext) => Promise<unknown>;

async function authorizeLogged(
  ctx: PluginContext,
  action: string,
  params: Record<string, unknown>,
  context: PluginPerformActionContext,
): Promise<AuthorizedReader> {
  try {
    return await authorizeReader(ctx, params, context);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      ctx.logger.warn(`${PLUGIN_NAME} read denied`, { action, reason: error.reason, actorType: context.actor.type });
    }
    throw error;
  }
}

function guardedRead<T>(
  ctx: PluginContext,
  action: string,
  read: () => Promise<T>,
): ReadHandler {
  return async (params, context) => {
    await authorizeLogged(ctx, action, params, context);
    try {
      return await read();
    } catch (error) {
      const result = unavailable(error);
      // Log the failure code only; never the raw router response.
      ctx.logger.warn(`${PLUGIN_NAME} router read failed`, { action, reason: result.reason });
      return result;
    }
  };
}

/**
 * Registers the read-only actions. Nothing here writes to the router: no
 * refresh/use/auto/sync/settings/login calls, no jobs, no agent tools, and no
 * caching of router responses.
 */
export function registerAccountRouterActions(ctx: PluginContext, client: RouterClient): void {
  ctx.actions.register(
    ROUTER_HEALTH_ACTION,
    guardedRead(ctx, ROUTER_HEALTH_ACTION, async (): Promise<HealthResult> => sanitizeHealth(await client.getJson("health"))),
  );
  ctx.actions.register(
    ROUTER_STATE_ACTION,
    guardedRead(ctx, ROUTER_STATE_ACTION, async (): Promise<StateResult> => sanitizeState(await client.getJson("state"))),
  );
  // Company config only; never touches the router. An unset or invalid URL is
  // returned as null so the UI shows "not configured" instead of a default link.
  ctx.actions.register(ROUTER_LINK_ACTION, async (params, context): Promise<RouterLinkResult> => {
    const { config } = await authorizeLogged(ctx, ROUTER_LINK_ACTION, params, context);
    return { routerUrl: safeRouterUrl(config.routerUrl) };
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME} plugin setup (read-only)`);
    registerAccountRouterActions(ctx, createRouterClient(ctx.http));
  },

  async onHealth() {
    // Plugin liveness only. Router reachability is checked per authorized call
    // so an instance-level health probe never touches account data.
    return { status: "ok", message: `${PLUGIN_NAME} ready (read-only)` };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
