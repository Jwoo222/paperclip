import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { pluginManifestV1Schema } from "@paperclipai/shared";
import { createTestHarness, type TestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest, {
  PAGE_ROUTE_PATH,
  ROUTER_HEALTH_ACTION,
  ROUTER_LINK_ACTION,
  ROUTER_STATE_ACTION,
} from "../src/manifest.js";
import plugin, { registerAccountRouterActions } from "../src/worker.js";
import { createRouterClient, ROUTER_ORIGIN, ROUTER_PATHS } from "../src/router-client.js";
import { authorizeReader } from "../src/access.js";
import { allowingHost, json, productionLikeHost, rawStateFixture, SECRET_MARKERS, type MockHost } from "./fixtures.js";

const ENABLED_COMPANY = "company-enabled";
const OTHER_COMPANY = "company-other";
const BOARD = { type: "user" as const, userId: "user-1" };

function harnessWithHost(host: MockHost): TestHarness {
  const harness = createTestHarness({ manifest });
  harness.ctx.config.get = async (companyId?: string) =>
    companyId === ENABLED_COMPANY ? { enabled: true } : {};
  registerAccountRouterActions(harness.ctx, createRouterClient(host));
  return harness;
}

function asBoard(companyId: string | null = ENABLED_COMPANY) {
  return { actor: { ...BOARD, companyId }, companyId };
}

describe("manifest", () => {
  it("passes the host manifest schema and declares only the host HTTP bridge and UI slots", () => {
    expect(pluginManifestV1Schema.safeParse(manifest).success).toBe(true);
    expect(manifest.capabilities).toEqual(["http.outbound", "ui.page.register", "ui.sidebar.register"]);
    expect(manifest.tools ?? []).toHaveLength(0);
    expect(manifest.jobs ?? []).toHaveLength(0);
    expect(manifest.webhooks ?? []).toHaveLength(0);
    expect(manifest.apiRoutes ?? []).toHaveLength(0);
    expect(manifest.entrypoints.ui).toBe("./dist/ui");
    expect(manifest.ui?.slots?.map((s) => [s.type, s.exportName, s.routePath])).toEqual([
      ["sidebar", "AccountRouterSidebarLink", undefined],
      ["page", "AccountRouterRoute", PAGE_ROUTE_PATH],
    ]);
  });

  it("UI slot exports and package entrypoints line up with the manifest", async () => {
    const ui = await import("../src/ui/index.js");
    for (const slot of manifest.ui?.slots ?? []) {
      expect(typeof (ui as Record<string, unknown>)[slot.exportName]).toBe("function");
    }
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.paperclipPlugin).toEqual({
      manifest: "./dist/manifest.js",
      worker: "./dist/worker.js",
      ui: "./dist/ui/",
    });
    expect(`${manifest.entrypoints.ui}/`).toBe(pkg.paperclipPlugin.ui);
  });

  it("narrows the optional routerUrl config to https or loopback http", () => {
    const schema = manifest.instanceConfigSchema as { properties: { routerUrl: { pattern: string; maxLength: number } } };
    const pattern = new RegExp(schema.properties.routerUrl.pattern);
    for (const ok of ["https://router.example.com/codex-router/", "http://127.0.0.1:8765/codex-router/", "http://localhost:8765"]) {
      expect(pattern.test(ok)).toBe(true);
    }
    for (const bad of [
      "http://router.example.com/",
      "https://user:pw@router.example.com/",
      "javascript:alert(1)",
      "http://10.0.0.5:8765/",
      "ftp://127.0.0.1/",
    ]) {
      expect(pattern.test(bad)).toBe(false);
    }
    expect(schema.properties.routerUrl.maxLength).toBe(2048);
  });

  it("pins the router to the fixed loopback origin and read-only paths", () => {
    expect(ROUTER_ORIGIN).toBe("http://127.0.0.1:8765");
    expect(ROUTER_PATHS).toEqual({
      health: "/codex-router/api/health",
      state: "/codex-router/api/state",
    });
  });

  it("registers only the three read actions and no data handlers", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);
    await expect(harness.getData("anything")).rejects.toThrow(/No data handler/);
    await expect(harness.getData(ROUTER_STATE_ACTION)).rejects.toThrow(/No data handler/);
    await expect(harness.performAction("refresh", {}, asBoard())).rejects.toThrow(/No action handler/);
    await expect(harness.performAction("use", {}, asBoard())).rejects.toThrow(/No action handler/);
  });
});

describe("router-link (company config only)", () => {
  function linkHarness(config: unknown) {
    const host = allowingHost();
    const harness = createTestHarness({ manifest });
    harness.ctx.config.get = async (companyId?: string) =>
      (companyId === ENABLED_COMPANY ? config : {}) as Record<string, unknown>;
    registerAccountRouterActions(harness.ctx, createRouterClient(host));
    return { host, harness };
  }

  it("returns a validated router URL only for an enabled company, without calling the router", async () => {
    const { host, harness } = linkHarness({ enabled: true, routerUrl: "http://127.0.0.1:8765/codex-router/" });
    await expect(harness.performAction(ROUTER_LINK_ACTION, {}, asBoard())).resolves.toEqual({
      routerUrl: "http://127.0.0.1:8765/codex-router/",
    });
    expect(host.calls).toHaveLength(0);
  });

  it("returns null for unset or unsafe addresses; there is no default link", async () => {
    for (const routerUrl of [
      undefined,
      "",
      "http://router.example.com/",
      "https://user:pw@router.example.com/",
      "javascript:alert(1)",
      42,
      `https://example.com/${"a".repeat(2100)}`,
    ]) {
      const { harness } = linkHarness({ enabled: true, routerUrl });
      await expect(harness.performAction(ROUTER_LINK_ACTION, {}, asBoard())).resolves.toEqual({ routerUrl: null });
    }
  });

  it("uses the same fail-closed gate as the reads and never logs the URL", async () => {
    const secretUrl = "https://node-01.example.ts.net/codex-router/";
    const { host, harness } = linkHarness({ enabled: true, routerUrl: secretUrl });
    await expect(harness.performAction(ROUTER_LINK_ACTION, {}, asBoard(OTHER_COMPANY))).rejects.toThrow(/company_not_enabled/);
    await expect(harness.performAction(ROUTER_LINK_ACTION, {}, {
      actor: { type: "agent", agentId: "agent-1", companyId: ENABLED_COMPANY },
      companyId: ENABLED_COMPANY,
    })).rejects.toThrow(/board_user_required/);
    await expect(harness.performAction(ROUTER_LINK_ACTION, {}, asBoard(null))).rejects.toThrow(/company_scope_required/);
    const disabled = linkHarness({ enabled: false, routerUrl: secretUrl });
    await expect(disabled.harness.performAction(ROUTER_LINK_ACTION, {}, asBoard())).rejects.toThrow(/company_not_enabled/);
    await harness.performAction(ROUTER_LINK_ACTION, {}, asBoard());
    expect(JSON.stringify(harness.logs)).not.toContain("example.ts.net");
    expect(host.calls).toHaveLength(0);
  });
});

describe("default setup uses ctx.http and stops at the host refusal", () => {
  it("returns blocked_by_host after one host call, with no retry and no host text", async () => {
    const host = productionLikeHost();
    const harness = createTestHarness({ manifest, config: { enabled: true } });
    harness.ctx.http.fetch = host.fetch;
    await plugin.definition.setup(harness.ctx);

    const state = await harness.performAction(ROUTER_STATE_ACTION, {}, asBoard());
    const health = await harness.performAction(ROUTER_HEALTH_ACTION, {}, asBoard());
    expect(state).toMatchObject({ connection: "error", reason: "blocked_by_host" });
    expect(health).toMatchObject({ connection: "error", reason: "blocked_by_host" });
    expect(host.calls.map((c) => c.url)).toEqual([
      `${ROUTER_ORIGIN}${ROUTER_PATHS.state}`,
      `${ROUTER_ORIGIN}${ROUTER_PATHS.health}`,
    ]);
    const serialized = JSON.stringify([state, health, harness.logs]);
    expect(serialized).not.toContain("private/reserved");
    expect(serialized).not.toContain("127.0.0.1");
  });

  it("is blocked by the capability check when http.outbound is not declared", async () => {
    const harness = createTestHarness({
      manifest: { ...manifest, capabilities: ["companies.read"] },
      config: { enabled: true },
    });
    await plugin.definition.setup(harness.ctx);
    await expect(harness.performAction(ROUTER_STATE_ACTION, {}, asBoard()))
      .resolves.toMatchObject({ connection: "error", reason: "blocked_by_host" });
  });
});

describe("caller gate (fail closed)", () => {
  let host: MockHost;
  let harness: TestHarness;

  beforeEach(() => {
    host = allowingHost();
    host.setRoute(ROUTER_PATHS.health, json({ service: "codex-router-web", version: 1 }));
    host.setRoute(ROUTER_PATHS.state, json(rawStateFixture()));
    harness = harnessWithHost(host);
  });

  it("allows a board user of an explicitly enabled company", async () => {
    await expect(harness.performAction(ROUTER_HEALTH_ACTION, {}, asBoard())).resolves.toMatchObject({
      connection: "online",
      service: "codex-router-web",
      version: 1,
    });
  });

  it("rejects agent callers even inside an enabled company", async () => {
    await expect(harness.performAction(ROUTER_STATE_ACTION, {}, {
      actor: { type: "agent", agentId: "agent-1", companyId: ENABLED_COMPANY },
      companyId: ENABLED_COMPANY,
    })).rejects.toThrow(/board_user_required/);
    expect(host.calls).toHaveLength(0);
  });

  it("rejects system callers and users without a user id", async () => {
    await expect(harness.performAction(ROUTER_STATE_ACTION, {}, {
      actor: { type: "system", companyId: ENABLED_COMPANY },
      companyId: ENABLED_COMPANY,
    })).rejects.toThrow(/board_user_required/);
    await expect(harness.performAction(ROUTER_STATE_ACTION, {}, {
      actor: { type: "user", userId: null, companyId: ENABLED_COMPANY },
      companyId: ENABLED_COMPANY,
    })).rejects.toThrow(/board_user_required/);
    expect(host.calls).toHaveLength(0);
  });

  it("rejects calls without a host-authorized company scope", async () => {
    await expect(harness.performAction(ROUTER_STATE_ACTION, {}, asBoard(null)))
      .rejects.toThrow(/company_scope_required/);
    expect(host.calls).toHaveLength(0);
  });

  it("rejects board users of a company that is not enabled", async () => {
    await expect(harness.performAction(ROUTER_STATE_ACTION, {}, asBoard(OTHER_COMPANY)))
      .rejects.toThrow(/company_not_enabled/);
    expect(host.calls).toHaveLength(0);
  });

  it("does not let caller params claim a different company than the host scope", async () => {
    // Through the bridge, the host scope decides the company, not params.
    await expect(harness.performAction(ROUTER_STATE_ACTION, { companyId: ENABLED_COMPANY }, {
      actor: { ...BOARD, companyId: OTHER_COMPANY },
      companyId: OTHER_COMPANY,
    })).rejects.toThrow(/company_not_enabled/);
    // Direct gate check: a params company that differs from the actor scope is refused.
    await expect(authorizeReader(harness.ctx, { companyId: OTHER_COMPANY }, {
      actor: { ...BOARD, agentId: null, runId: null, companyId: ENABLED_COMPANY },
      companyId: ENABLED_COMPANY,
    })).rejects.toThrow(/company_mismatch/);
    // Without a host scope, a params company alone is never enough.
    await expect(authorizeReader(harness.ctx, { companyId: ENABLED_COMPANY }, {
      actor: { ...BOARD, agentId: null, runId: null, companyId: null },
      companyId: null,
    })).rejects.toThrow(/company_scope_required/);
    expect(host.calls).toHaveLength(0);
  });

  it("denies when company config is missing, not strictly true, or unreadable", async () => {
    for (const config of [{}, { enabled: "true" }, { enabled: 1 }, null]) {
      const h = createTestHarness({ manifest });
      h.ctx.config.get = async () => config as Record<string, unknown>;
      registerAccountRouterActions(h.ctx, createRouterClient(host));
      await expect(h.performAction(ROUTER_STATE_ACTION, {}, asBoard())).rejects.toThrow(/company_not_enabled/);
    }
    const failing = createTestHarness({ manifest });
    failing.ctx.config.get = async () => {
      throw new Error("Plugin is not enabled for this company");
    };
    registerAccountRouterActions(failing.ctx, createRouterClient(host));
    await expect(failing.performAction(ROUTER_STATE_ACTION, {}, asBoard())).rejects.toThrow(/company_not_enabled/);
    expect(host.calls).toHaveLength(0);
  });

  it("the default plugin setup is also fail-closed with no config", async () => {
    const h = createTestHarness({ manifest });
    const guard = productionLikeHost();
    h.ctx.http.fetch = guard.fetch;
    await plugin.definition.setup(h.ctx);
    await expect(h.performAction(ROUTER_STATE_ACTION, {}, asBoard())).rejects.toThrow(/company_not_enabled/);
    expect(guard.calls).toHaveLength(0);
  });
});

describe("sanitized state", () => {
  let host: MockHost;
  let harness: TestHarness;

  beforeEach(() => {
    host = allowingHost();
    host.setRoute(ROUTER_PATHS.state, json(rawStateFixture()));
    harness = harnessWithHost(host);
  });

  it("returns only allowlisted fields", async () => {
    const result = await harness.performAction<Record<string, unknown>>(ROUTER_STATE_ACTION, {}, asBoard());

    expect(Object.keys(result).sort()).toEqual(["accounts", "connection", "fetchedAt", "job", "omittedAccountCount"]);
    expect(result.connection).toBe("online");
    expect(result.job).toEqual({ status: "running" });
    expect(result.omittedAccountCount).toBe(3);
    expect(result.accounts).toEqual([
      {
        provider: "codex",
        alias: "main-codex",
        active: true,
        needsLogin: false,
        disabled: false,
        usage: {
          checkedAt: "2026-09-28T01:02:03.000Z",
          failed: false,
          primary: { usedPercent: 42.5, resetsAt: "2026-09-28T05:00:00.000Z", windowSeconds: 18000 },
          secondary: { usedPercent: 10, resetsAt: "2026-10-01T00:00:00.000Z", windowSeconds: 604800 },
        },
      },
      {
        provider: "codex",
        alias: "backup-codex",
        active: false,
        needsLogin: true,
        disabled: true,
        usage: null,
      },
      {
        provider: "claude",
        alias: "claude-primary",
        active: true,
        needsLogin: false,
        disabled: false,
        usage: {
          checkedAt: null,
          failed: true,
          primary: { usedPercent: null, resetsAt: null, windowSeconds: null },
          secondary: null,
        },
      },
    ]);
  });

  it("never returns or logs secret-bearing router fields", async () => {
    const result = await harness.performAction(ROUTER_STATE_ACTION, {}, asBoard());
    const serialized = JSON.stringify(result) + JSON.stringify(harness.logs);
    for (const marker of Object.values(SECRET_MARKERS)) {
      expect(serialized).not.toContain(marker);
    }
    for (const field of ["csrf", "userCode", "email", "path", "targets", "events", "history", "login", "settings", "url", "message", "plan"]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it("does not cache: each call reads through the host again", async () => {
    await harness.performAction(ROUTER_STATE_ACTION, {}, asBoard());
    await harness.performAction(ROUTER_STATE_ACTION, {}, asBoard());
    expect(host.calls.filter((c) => c.url.endsWith(ROUTER_PATHS.state))).toHaveLength(2);
  });

  it("ignores caller-provided url, path, or host params", async () => {
    await harness.performAction(ROUTER_STATE_ACTION, {
      url: "http://169.254.169.254/latest/meta-data",
      path: "/codex-router/api/action",
      host: "evil.example",
      port: 80,
    }, asBoard());
    expect(host.calls.map((c) => c.url)).toEqual([`${ROUTER_ORIGIN}${ROUTER_PATHS.state}`]);
  });

  it("reports schema mismatch without echoing the body", async () => {
    host.setRoute(ROUTER_PATHS.state, json({ accounts: "nope", csrf: SECRET_MARKERS.csrf }));
    const result = await harness.performAction(ROUTER_STATE_ACTION, {}, asBoard());
    expect(result).toMatchObject({ connection: "error", reason: "schema_mismatch" });
    expect(JSON.stringify(result)).not.toContain(SECRET_MARKERS.csrf);
  });

  it("treats an unknown job status as a safe 'unknown' enum", async () => {
    host.setRoute(ROUTER_PATHS.state, json({ accounts: [], job: { status: "weird", message: SECRET_MARKERS.jobMessage } }));
    const result = await harness.performAction<Record<string, unknown>>(ROUTER_STATE_ACTION, {}, asBoard());
    expect(result.job).toEqual({ status: "unknown" });
  });
});

describe("health", () => {
  it("rejects a health body that is not the router service", async () => {
    const host = allowingHost();
    host.setRoute(ROUTER_PATHS.health, json({ service: "something-else", version: 1 }));
    await expect(harnessWithHost(host).performAction(ROUTER_HEALTH_ACTION, {}, asBoard()))
      .resolves.toMatchObject({ connection: "error", reason: "schema_mismatch" });
  });
});
