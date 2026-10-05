// @vitest-environment jsdom
//
// Container tests for the page slot. The SDK hooks are the real
// `@paperclipai/plugin-sdk/ui` exports; only the host runtime they delegate to
// (`globalThis.__paperclipPluginBridge__.sdkUi`) is a test stand-in whose
// action calls resolve when each test says so. All data is test-only.

import * as React from "react";
import { act, type ReactNode } from "react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRouterRoute, AccountRouterSidebarLink } from "../../src/ui/AccountRouterRoute.js";
import { readyState } from "./fixtures.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const TEST_ROUTER_URL = "https://router.example.test/codex-router/";
const CHECKED_AT = "2026-09-28T00:41:12.000Z";
const BLOCKED = { connection: "error", reason: "blocked_by_host", checkedAt: CHECKED_AT };
/** Shape the host bridge throws: a plain object, not an Error. */
const DENIED_ERROR = {
  code: "WORKER_ERROR",
  message: "account router access denied: company_not_enabled (raw detail C:\\Users\\someone csrf-SECRET)",
};

interface Call {
  key: string;
  companyId: string | null;
  params: unknown;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

let calls: Call[];
let hostCompanyId: string | null;
let container: HTMLDivElement;
let root: Root;

const sdkUi = {
  StatusBadge: ({ label, status }: { label: string; status: string }) =>
    React.createElement("span", { "data-badge": status }, label),
  KeyValueList: ({ pairs }: { pairs: { label: string; value: ReactNode }[] }) =>
    React.createElement(
      "dl",
      null,
      pairs.flatMap((p) => [
        React.createElement("dt", { key: `${p.label}:l` }, p.label),
        React.createElement("dd", { key: `${p.label}:v` }, p.value),
      ]),
    ),
  Spinner: ({ label }: { label?: string }) => React.createElement("span", { role: "status", "aria-label": label }),
  useHostContext: () => ({
    companyId: hostCompanyId,
    companyPrefix: hostCompanyId ? "TST" : null,
    projectId: null,
    entityId: null,
    entityType: null,
    userId: "user-1",
  }),
  // Mirrors the host: the company is read when the action is invoked.
  usePluginAction: (key: string) =>
    React.useCallback(
      (params?: Record<string, unknown>) =>
        new Promise((resolve, reject) => {
          calls.push({ key, companyId: hostCompanyId, params, resolve, reject });
        }),
      [key],
    ),
  usePluginData: () => {
    throw new Error("usePluginData must not be used");
  },
  useHostNavigation: () => ({
    resolveHref: (to: string) => `/TST${to}`,
    navigate: () => undefined,
    linkProps: (to: string) => ({ href: `/TST${to}`, onClick: () => undefined }),
  }),
  useHostLocation: () => ({ pathname: "/TST/issues", search: "", hash: "" }),
};

beforeEach(() => {
  calls = [];
  hostCompanyId = COMPANY_A;
  (globalThis as { __paperclipPluginBridge__?: unknown }).__paperclipPluginBridge__ = { react: React, sdkUi };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const PAGE_CONTEXT = { context: sdkUi.useHostContext() };

function renderPage() {
  act(() => root.render(React.createElement(AccountRouterRoute, PAGE_CONTEXT)));
}

function text() {
  return document.body.textContent ?? "";
}

function alerts() {
  return [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? "");
}

function retryButtons() {
  return [...document.querySelectorAll("button")].filter((b) => (b.textContent ?? "").includes("다시 확인"));
}

function pending(key: string) {
  return calls.filter((c) => c.key === key);
}

async function settle(call: Call, value: unknown, ok = true) {
  await act(async () => {
    if (ok) call.resolve(value);
    else call.reject(value);
  });
}

describe("AccountRouterRoute (page container)", () => {
  it("reads once on entry, shows loading, then the host refusal as blocked_by_host", async () => {
    renderPage();
    expect(text()).toContain("계정 라우터");
    expect(document.querySelector('[aria-label="불러오는 중"]')).not.toBeNull();
    expect(calls.map((c) => [c.key, c.companyId])).toEqual([
      ["router-state", COMPANY_A],
      ["router-link", COMPANY_A],
    ]);
    // Company scope comes from the host, never from params.
    expect(calls.every((c) => c.params === undefined)).toBe(true);

    await settle(pending("router-link")[0], { routerUrl: null });
    await settle(pending("router-state")[0], BLOCKED);
    expect(alerts()).toEqual([expect.stringContaining("Paperclip이 연결 차단")]);
    expect(text()).toContain("계정 정보 없음");
    expect(text()).toContain("라우터 주소 미설정");
    expect(calls).toHaveLength(2);
  });

  it("maps a bridge denial to its code only and never renders the raw message", async () => {
    renderPage();
    await settle(pending("router-link")[0], DENIED_ERROR, false);
    await settle(pending("router-state")[0], DENIED_ERROR, false);
    expect(alerts()).toEqual([expect.stringContaining("이 회사는 켜져 있지 않음")]);
    expect(text()).not.toMatch(/WORKER_ERROR|raw detail|csrf|Users|account router access denied/);
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("maps unknown bridge errors to a generic denial without echoing text", async () => {
    renderPage();
    await settle(pending("router-link")[0], { code: "UNKNOWN", message: "Forbidden: user-code 1234" }, false);
    await settle(pending("router-state")[0], { code: "UNKNOWN", message: "Forbidden: user-code 1234" }, false);
    expect(alerts()).toEqual([expect.stringContaining("접근 거부")]);
    expect(text()).not.toMatch(/Forbidden|user-code|1234/);
  });

  it("shows the validated router link and drops an unsafe one", async () => {
    renderPage();
    await settle(pending("router-link")[0], { routerUrl: TEST_ROUTER_URL });
    await settle(pending("router-state")[0], { ...readyState() });
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs)).toEqual(new Set([TEST_ROUTER_URL]));

    act(() => root.unmount());
    root = createRoot(container);
    calls = [];
    renderPage();
    await settle(pending("router-link")[0], { routerUrl: "javascript:alert(1)" });
    await settle(pending("router-state")[0], { ...readyState() });
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(text()).toContain("라우터 주소 미설정");
  });

  it("drops old data at once on company switch and ignores the previous company's late response", async () => {
    renderPage();
    await settle(pending("router-link")[0], { routerUrl: TEST_ROUTER_URL });
    await settle(pending("router-state")[0], { ...readyState() });
    expect(text()).toContain("sample-gpt-a");

    // A retry for company A is still in flight when the user switches to B.
    act(() => retryButtons()[0].click());
    const lateA = pending("router-state")[1];
    const lateLinkA = pending("router-link")[1];
    expect(lateA.companyId).toBe(COMPANY_A);

    hostCompanyId = COMPANY_B;
    renderPage();
    // Old accounts and link are gone before B answers.
    expect(text()).not.toContain("sample-gpt-a");
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(document.querySelector('[aria-label="불러오는 중"]')).not.toBeNull();
    const stateB = pending("router-state")[2];
    const linkB = pending("router-link")[2];
    expect([stateB.companyId, linkB.companyId]).toEqual([COMPANY_B, COMPANY_B]);

    // A's late answer arrives after the switch: it must not be applied.
    await settle(lateLinkA, { routerUrl: TEST_ROUTER_URL });
    await settle(lateA, { ...readyState() });
    expect(text()).not.toContain("sample-gpt-a");
    expect(document.querySelector('[aria-label="불러오는 중"]')).not.toBeNull();

    await settle(linkB, { routerUrl: null });
    await settle(stateB, BLOCKED);
    expect(alerts()).toEqual([expect.stringContaining("Paperclip이 연결 차단")]);
    expect(text()).not.toContain("sample-gpt-a");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("runs one retry at a time and discards shown data when the retry is denied", async () => {
    renderPage();
    await settle(pending("router-link")[0], { routerUrl: TEST_ROUTER_URL });
    await settle(pending("router-state")[0], { ...readyState() });

    const retry = retryButtons()[0];
    act(() => {
      retry.click();
      retry.click();
    });
    act(() => retryButtons()[0]?.click());
    expect(pending("router-state")).toHaveLength(2);
    expect(pending("router-link")).toHaveLength(2);
    expect(retryButtons().every((b) => b.disabled)).toBe(true);
    // Data stays visible while the retry is in flight.
    expect(text()).toContain("sample-gpt-a");

    await settle(pending("router-link")[1], DENIED_ERROR, false);
    await settle(pending("router-state")[1], DENIED_ERROR, false);
    expect(text()).not.toContain("sample-gpt-a");
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(alerts()).toEqual([expect.stringContaining("접근 거부")]);
  });

  it("never polls or retries on its own", async () => {
    vi.useFakeTimers();
    renderPage();
    await settle(pending("router-link")[0], { routerUrl: null });
    await settle(pending("router-state")[0], BLOCKED);
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });
    expect(calls).toHaveLength(2);
  });

  it("does not call the worker without a company scope", () => {
    hostCompanyId = null;
    renderPage();
    expect(calls).toHaveLength(0);
    expect(alerts()).toEqual([expect.stringContaining("회사 선택 필요")]);
    expect(retryButtons()).toHaveLength(0);
  });
});

describe("AccountRouterSidebarLink", () => {
  it("is a host-navigated link to the plugin page and never calls the worker", () => {
    act(() => root.render(React.createElement(AccountRouterSidebarLink, PAGE_CONTEXT)));
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/TST/account-router");
    expect(link?.textContent).toBe("계정 라우터");
    expect(link?.getAttribute("target")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("UI sources", () => {
  it("use no transport, timers, storage, or getData of their own", () => {
    // jsdom rewrites import.meta.url, so resolve from the package root (vitest root).
    const dir = join(process.cwd(), "src", "ui");
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      for (const banned of [
        /(^|[^.\w])fetch\s*\(/m,
        /\bXMLHttpRequest\b/,
        /\bWebSocket\b/,
        /\bEventSource\b/,
        /\bsetInterval\b/,
        /\bsetTimeout\b/,
        /\blocalStorage\b/,
        /\bsessionStorage\b/,
        /\bindexedDB\b/,
        /\busePluginData\b/,
        /\bgetData\b/,
        /\busePluginStream\b/,
        /console\.(log|warn|error|info)/,
      ]) {
        expect(`${file}: ${banned.test(source)}`).toBe(`${file}: false`);
      }
    }
  });
});
