import { PLUGIN_RPC_ERROR_CODES, type PluginHttpClient } from "@paperclipai/plugin-sdk";

/**
 * Fixed origin of the existing account router web server
 * (tools/codex-auth-router/web_server.py binds 127.0.0.1:8765).
 *
 * Origin and paths are constants, never read from config or caller params, so
 * callers cannot steer the request anywhere else.
 *
 * Every request goes through the host-managed `ctx.http.fetch` bridge
 * (`http.outbound`). This module has no other transport: no node:http, no
 * sockets, no global fetch. The host still refuses loopback and private
 * targets in general (plugin-host-services.ts `isPrivateIP`). Only its
 * host-managed local read (plugin-local-read.ts) serves this origin, and only
 * for a board user's action in a company with an enabled instance-admin grant
 * and `enabled: true` config. Without that the read ends as
 * `blocked_by_host`. A refusal is final: the client does not retry and does
 * not fall back to another transport.
 */
export const ROUTER_ORIGIN = "http://127.0.0.1:8765";
export const ROUTER_PATHS = {
  health: "/codex-router/api/health",
  state: "/codex-router/api/state",
} as const;

export type RouterEndpoint = keyof typeof ROUTER_PATHS;

export const ROUTER_LIMITS = {
  /**
   * Worker-side guard only. The real deadline is the host's absolute 3 s
   * limit, which aborts the socket. This guard is a little longer so the
   * host's own timeout result arrives first; if it still fires, the action
   * settles and the host aborts the read with the ended invocation.
   */
  timeoutMs: 4_000,
  /**
   * Defence in depth. The host already stops streaming at the same caps
   * (health 4 KiB, state 256 KiB) and returns `too_large`.
   */
  maxBytes: {
    health: 4 * 1024,
    state: 256 * 1024,
  },
} as const;

export type RouterReadFailure =
  | "blocked_by_host"
  | "offline"
  | "timeout"
  | "redirect_blocked"
  | "rejected_by_router"
  | "http_error"
  | "unexpected_content_type"
  | "too_large"
  | "invalid_json"
  | "schema_mismatch";

/** Carries only a failure code. Never includes response bodies, headers, or host error text. */
export class RouterReadError extends Error {
  readonly code: RouterReadFailure;

  constructor(code: RouterReadFailure) {
    super(`account router read failed: ${code}`);
    this.name = "RouterReadError";
    this.code = code;
  }
}

/** The only transport: the host bridge from `ctx.http`. */
export type RouterTransport = Pick<PluginHttpClient, "fetch">;

export interface RouterClientOptions {
  timeoutMs?: number;
}

export interface RouterClient {
  getJson(endpoint: RouterEndpoint): Promise<unknown>;
}

// Host refusal messages (plugin-host-services.ts validateAndResolveFetchUrl,
// plugin-local-read.ts, SDK test harness requireCapability). Matched only to
// pick a code; the text itself is never returned or logged.
const HOST_POLICY_MESSAGES = [
  "are in private/reserved ranges",
  "Disallowed protocol",
  "missing required capability",
  "local_read_denied:",
];

// Host local-read transport failures (`local_read_failed: <reason>`).
const HOST_LOCAL_READ_FAILURES: Record<string, RouterReadFailure> = {
  timeout: "timeout",
  too_large: "too_large",
  // Grant disabled, company switched off, or the action ended mid-read.
  cancelled: "blocked_by_host",
  // Something other than the expected peer answered on the socket.
  peer_mismatch: "blocked_by_host",
  offline: "offline",
};

function classifyHostError(error: unknown): RouterReadFailure {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED) return "blocked_by_host";
  if (code === PLUGIN_RPC_ERROR_CODES.TIMEOUT) return "timeout";
  const message = error instanceof Error ? error.message : "";
  const localFailure = /local_read_failed: ([a-z_]+)/.exec(message)?.[1];
  if (localFailure) return HOST_LOCAL_READ_FAILURES[localFailure] ?? "offline";
  if (HOST_POLICY_MESSAGES.some((text) => message.includes(text))) return "blocked_by_host";
  return "offline";
}

function header(response: Response, name: string): string {
  return (response.headers.get(name) ?? "").toLowerCase();
}

export function createRouterClient(transport: RouterTransport, options: RouterClientOptions = {}): RouterClient {
  const timeoutMs = options.timeoutMs ?? ROUTER_LIMITS.timeoutMs;

  return {
    async getJson(endpoint) {
      const path = ROUTER_PATHS[endpoint];
      if (!path) throw new RouterReadError("schema_mismatch");
      const maxBytes = ROUTER_LIMITS.maxBytes[endpoint];

      let deadline: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new RouterReadError("timeout")), timeoutMs);
      });

      let response: Response;
      try {
        // Single attempt. Accept is the only header; the host refuses any
        // other header, a body, or a non-GET method, and never follows
        // redirects (a 3xx comes back as a bare status).
        response = await Promise.race([
          transport.fetch(`${ROUTER_ORIGIN}${path}`, {
            method: "GET",
            headers: { Accept: "application/json" },
            redirect: "manual",
          }),
          timedOut,
        ]);
      } catch (error) {
        if (error instanceof RouterReadError) throw error;
        throw new RouterReadError(classifyHostError(error));
      } finally {
        clearTimeout(deadline);
      }

      const status = response.status;
      if (status >= 300 && status < 400) throw new RouterReadError("redirect_blocked");
      if (status === 401 || status === 403) throw new RouterReadError("rejected_by_router");
      if (status !== 200) throw new RouterReadError("http_error");

      if (!header(response, "content-type").startsWith("application/json")) {
        throw new RouterReadError("unexpected_content_type");
      }

      const declared = Number(header(response, "content-length") || Number.NaN);
      if (Number.isFinite(declared) && declared > maxBytes) throw new RouterReadError("too_large");

      let text: string;
      try {
        text = await response.text();
      } catch {
        throw new RouterReadError("offline");
      }
      if (Buffer.byteLength(text, "utf8") > maxBytes) throw new RouterReadError("too_large");

      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new RouterReadError("invalid_json");
      }
    },
  };
}
