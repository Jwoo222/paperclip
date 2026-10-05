import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { JsonRpcCallError, PLUGIN_RPC_ERROR_CODES } from "@paperclipai/plugin-sdk";
import { createRouterClient, ROUTER_LIMITS, ROUTER_ORIGIN, ROUTER_PATHS, RouterReadError } from "../src/router-client.js";
import { allowingHost, hang, json, productionLikeHost, type MockHost } from "./fixtures.js";

async function failureCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RouterReadError);
    // The error must carry only the code, never body or host text.
    expect((error as Error).message).toMatch(/^account router read failed: [a-z_]+$/);
    return (error as RouterReadError).code;
  }
  throw new Error("expected the read to fail");
}

function rejectingHost(error: unknown): MockHost {
  const host = allowingHost();
  return {
    ...host,
    async fetch(url, init) {
      host.calls.push({ url: String(url), init });
      throw error;
    },
  };
}

describe("transport", () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const workerSources = readdirSync(srcDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(srcDir, name), "utf8") }));

  it("has no direct network transport in worker sources", () => {
    expect(workerSources.map((s) => s.name)).toContain("router-client.ts");
    for (const { name, text } of workerSources) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const banned of [/node:(http|https|net|tls|dgram)\b/, /from\s+["'](http|https|net|tls|undici)["']/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /(^|[^.\w])fetch\s*\(/m]) {
        expect({ name, match: banned.test(code) }).toEqual({ name, match: false });
      }
    }
  });

  it("sends one plain GET to the fixed origin and path through the host bridge", async () => {
    const host = allowingHost();
    host.setRoute(ROUTER_PATHS.health, json({ service: "codex-router-web", version: 1 }));
    await expect(createRouterClient(host).getJson("health")).resolves.toEqual({ service: "codex-router-web", version: 1 });
    expect(host.calls).toHaveLength(1);
    const call = host.calls[0]!;
    expect(call.url).toBe(`${ROUTER_ORIGIN}${ROUTER_PATHS.health}`);
    expect(call.init?.method).toBe("GET");
    expect(call.init?.body).toBeUndefined();
    const headers = Object.keys(call.init?.headers ?? {}).map((k) => k.toLowerCase());
    expect(headers).toEqual(["accept"]);
  });
});

describe("host-managed local read results", () => {
  it("maps local-read denials and transport failures to fixed codes, once each", async () => {
    const cases: Array<[unknown, string]> = [
      [new JsonRpcCallError({ code: PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED, message: "local_read_denied: grant_disabled" }), "blocked_by_host"],
      [new Error("local_read_denied: invocation_reused"), "blocked_by_host"],
      [new JsonRpcCallError({ code: PLUGIN_RPC_ERROR_CODES.TIMEOUT, message: "local_read_failed: timeout" }), "timeout"],
      [new Error("local_read_failed: too_large"), "too_large"],
      [new Error("local_read_failed: cancelled"), "blocked_by_host"],
      [new Error("local_read_failed: peer_mismatch"), "blocked_by_host"],
      [new Error("local_read_failed: offline"), "offline"],
      [new Error("local_read_failed: something_new"), "offline"],
    ];
    for (const [error, expected] of cases) {
      const host = rejectingHost(error);
      expect(await failureCode(createRouterClient(host).getJson("state"))).toBe(expected);
      expect(host.calls).toHaveLength(1);
    }
  });

  it("keeps the worker guard longer than the host's 3 s deadline", () => {
    expect(ROUTER_LIMITS.timeoutMs).toBeGreaterThan(3_000);
  });
});

describe("host refusal (current production host)", () => {
  it("maps the loopback refusal to blocked_by_host after exactly one attempt", async () => {
    const host = productionLikeHost();
    const client = createRouterClient(host);
    expect(await failureCode(client.getJson("state"))).toBe("blocked_by_host");
    expect(await failureCode(client.getJson("health"))).toBe("blocked_by_host");
    expect(host.calls.map((c) => c.url)).toEqual([
      `${ROUTER_ORIGIN}${ROUTER_PATHS.state}`,
      `${ROUTER_ORIGIN}${ROUTER_PATHS.health}`,
    ]);
  });

  it("maps a capability denial to blocked_by_host without retrying", async () => {
    const host = rejectingHost(new JsonRpcCallError({
      code: PLUGIN_RPC_ERROR_CODES.CAPABILITY_DENIED,
      message: "Plugin is missing required capability http.outbound",
    }));
    expect(await failureCode(createRouterClient(host).getJson("state"))).toBe("blocked_by_host");
    expect(host.calls).toHaveLength(1);
  });

  it("maps a host RPC timeout to timeout and other host errors to offline, once each", async () => {
    const timedOut = rejectingHost(new JsonRpcCallError({ code: PLUGIN_RPC_ERROR_CODES.TIMEOUT, message: "timed out" }));
    expect(await failureCode(createRouterClient(timedOut).getJson("state"))).toBe("timeout");
    expect(timedOut.calls).toHaveLength(1);

    const refused = rejectingHost(new Error("connect ECONNREFUSED 127.0.0.1:8765"));
    expect(await failureCode(createRouterClient(refused).getJson("state"))).toBe("offline");
    expect(refused.calls).toHaveLength(1);
  });
});

describe("response handling (simulated future connector)", () => {
  it("blocks redirects instead of following them", async () => {
    const host = allowingHost();
    host.setRoute(ROUTER_PATHS.state, () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    expect(await failureCode(createRouterClient(host).getJson("state"))).toBe("redirect_blocked");
    expect(host.calls).toHaveLength(1);
  });

  it("maps router 403 to rejected_by_router and other statuses to http_error", async () => {
    const host = allowingHost();
    host.setRoute(ROUTER_PATHS.state, json({ error: "forbidden" }, 403));
    host.setRoute(ROUTER_PATHS.health, json({ error: "boom" }, 500));
    const client = createRouterClient(host);
    expect(await failureCode(client.getJson("state"))).toBe("rejected_by_router");
    expect(await failureCode(client.getJson("health"))).toBe("http_error");
  });

  it("stops waiting for a hanging host call", async () => {
    const host = allowingHost();
    host.setRoute(ROUTER_PATHS.state, hang);
    const started = Date.now();
    expect(await failureCode(createRouterClient(host, { timeoutMs: 200 }).getJson("state"))).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(host.calls).toHaveLength(1);
  });

  it("rejects bodies over the size limit (declared or actual)", async () => {
    const host = allowingHost();
    host.setRoute(ROUTER_PATHS.health, json({ pad: "x".repeat(ROUTER_LIMITS.maxBytes.health + 1) }));
    host.setRoute(ROUTER_PATHS.state, () =>
      new Response("a".repeat(ROUTER_LIMITS.maxBytes.state + 1), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createRouterClient(host);
    expect(await failureCode(client.getJson("health"))).toBe("too_large");
    expect(await failureCode(client.getJson("state"))).toBe("too_large");
  });

  it("rejects non-JSON content types and malformed JSON", async () => {
    const host = allowingHost();
    host.setRoute(ROUTER_PATHS.health, () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    host.setRoute(ROUTER_PATHS.state, () => new Response("{not json csrf-SECRET", { status: 200, headers: { "content-type": "application/json" } }));
    const client = createRouterClient(host);
    expect(await failureCode(client.getJson("health"))).toBe("unexpected_content_type");
    expect(await failureCode(client.getJson("state"))).toBe("invalid_json");
  });
});
