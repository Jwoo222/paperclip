import { JSONRPC_ERROR_CODES, JsonRpcCallError } from "@paperclipai/plugin-sdk";
import { ROUTER_ORIGIN, type RouterTransport } from "../src/router-client.js";

export const SECRET_MARKERS = {
  csrf: "csrf-SECRET-token-value",
  userCode: "USER-CODE-9999",
  email: "owner@example.com",
  targetPath: "C:\\Users\\someone\\.codex\\auth.json",
  eventMessage: "upstream said: bearer sk-live-SECRET",
  jobMessage: "job-message-SECRET",
  verificationUrl: "https://auth.openai.com/device?code=SECRET",
  publicUrl: "https://node-01.example.ts.net/codex-router/",
} as const;

/** Shape of web_server.py App.snapshot(), seeded with values that must never leak. */
export function rawStateFixture(): Record<string, unknown> {
  return {
    accounts: [
      {
        label: "main-codex",
        email: SECRET_MARKERS.email,
        plan: "pro",
        disabled: false,
        cooldown_until: null,
        provider: "codex",
        needsLogin: false,
        probe: {
          at: "2026-09-28T01:02:03Z",
          error: false,
          primary: { used: 42.5, reset_at: "2026-09-28T05:00:00+00:00", window_seconds: 18000 },
          secondary: { used: 10, reset_at: "2026-10-01T00:00:00+00:00", window_seconds: 604800 },
        },
      },
      {
        label: "backup-codex",
        email: "second@example.com",
        disabled: true,
        provider: "codex",
        needsLogin: true,
        probe: null,
      },
      {
        label: "claude-primary",
        email: "third@example.com",
        disabled: false,
        provider: "claude",
        needsLogin: false,
        probe: { at: "not-a-date", error: true, primary: { used: "90", reset_at: 12, window_seconds: -1 }, secondary: null },
      },
      // Invalid rows must be dropped, not echoed.
      { label: SECRET_MARKERS.email, provider: "codex" },
      { label: "unknown-provider", provider: "gemini" },
      "not-an-object",
    ],
    active: "main-codex",
    activeClaude: "claude-primary",
    targets: [{ type: "codex", provider: "codex", path: SECRET_MARKERS.targetPath, note: "note", account: "main-codex" }],
    settings: { primary_threshold_percent: 90, secondary_threshold_percent: 95, cooldown_minutes: 60, watch: true, interval: 300 },
    history: [{ at: "2026-09-27T00:00:00Z", from: "a", to: "b", reason: "threshold", provider: "codex" }],
    events: [{ at: "2026-09-27T00:00:00Z", action: "refresh", status: "error", message: SECRET_MARKERS.eventMessage }],
    job: { id: "abc123", action: "refresh", status: "running", message: SECRET_MARKERS.jobMessage },
    login: {
      label: "new",
      verificationUrl: SECRET_MARKERS.verificationUrl,
      userCode: SECRET_MARKERS.userCode,
      status: "waiting",
      message: "enter code",
      provider: "codex",
      needsCode: false,
    },
    legacyOpen: false,
    csrf: SECRET_MARKERS.csrf,
    remoteEnabled: true,
    url: SECRET_MARKERS.publicUrl,
  };
}

export interface HostCall {
  url: string;
  init: RequestInit | undefined;
}

/** A route returns the host bridge's answer, or never settles to simulate a hang. */
export type HostRoute = () => Response | Promise<Response>;

export interface MockHost extends RouterTransport {
  calls: HostCall[];
  setRoute(path: string, route: HostRoute): void;
}

export function json(body: unknown, status = 200): HostRoute {
  return () => {
    const payload = JSON.stringify(body);
    return new Response(payload, {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(Buffer.byteLength(payload)),
      },
    });
  };
}

export const hang: HostRoute = () => new Promise<Response>(() => {});

/**
 * Behaves like today's host bridge (plugin-host-services.ts): loopback and
 * private targets are refused before any connection, and the worker receives
 * the refusal as a JSON-RPC error.
 */
export function productionLikeHost(): MockHost {
  const calls: HostCall[] = [];
  return {
    calls,
    setRoute() {
      throw new Error("the production-like host never reaches a route");
    },
    async fetch(url, init) {
      calls.push({ url: String(url), init });
      const hostname = new URL(String(url)).hostname;
      throw new JsonRpcCallError({
        code: JSONRPC_ERROR_CODES.INTERNAL_ERROR,
        message: `All resolved IPs for ${hostname} are in private/reserved ranges`,
      });
    },
  };
}

/**
 * Test-only stand-in for a future host-managed connector that allows exactly
 * the fixed router origin. Used to check response handling; it does not
 * exist in the real host.
 */
export function allowingHost(): MockHost {
  const calls: HostCall[] = [];
  const routes = new Map<string, HostRoute>();
  return {
    calls,
    setRoute(path, route) {
      routes.set(path, route);
    },
    async fetch(url, init) {
      calls.push({ url: String(url), init });
      const parsed = new URL(String(url));
      if (parsed.origin !== ROUTER_ORIGIN) throw new Error("mock host: origin not allowed");
      const route = routes.get(`${parsed.pathname}${parsed.search}`);
      return route ? route() : json({ error: "not found" }, 404)();
    },
  };
}
