// @vitest-environment jsdom
// UI presentation tests. Included by the package vitest config; this docblock
// switches the file to jsdom.

import * as React from "react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { AccountRouterPage, BAR_TONE } from "../../src/ui/AccountRouterPage.js";
import {
  formatWindow,
  safeRouterUrl,
  viewFromActionError,
  viewFromStateResult,
  type AccountRouterPageProps,
} from "../../src/ui/view.js";
import { SAMPLE_ROUTER_URL, VIEWS, readyState } from "./fixtures.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Test stand-ins for the host SDK components. They keep the label and role
// so assertions can read them; styling comes from the host at runtime.
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
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { __paperclipPluginBridge__?: unknown }).__paperclipPluginBridge__ = { react: React, sdkUi };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(props: AccountRouterPageProps) {
  act(() => root.render(React.createElement(AccountRouterPage, props)));
}

function text() {
  return document.body.textContent ?? "";
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === name || b.getAttribute("aria-label") === name);
  if (!found) throw new Error(`button not found: ${name}`);
  return found;
}

function alerts() {
  return [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? "");
}

describe("AccountRouterPage", () => {
  it("renders GPT and Claude sections from the sanitized DTO with window labels from windowSeconds", () => {
    render({ view: VIEWS.ready, routerUrl: SAMPLE_ROUTER_URL });
    const headings = [...document.querySelectorAll("h2")].map((h) => h.textContent);
    expect(headings).toEqual(["GPT · Codex계정 3", "Claude계정 2"]);
    expect(text()).toContain("sample-gpt-a");
    expect(text()).toContain("sample-claude-a");
    const meters = [...document.querySelectorAll('[role="meter"]')].map((m) => m.getAttribute("aria-label"));
    expect(meters).toEqual(["5시간 사용률 42%", "7일 사용률 67%", "3시간 사용률 91%", "7일 사용률 99%"]);
    expect(alerts()).toEqual([]);
    expect(text()).toContain("계정 전환 시 다음 작업부터 적용");
    // DTO has no email, plan, or target count: nothing invented.
    expect(text()).not.toMatch(/@|요금제|연결 대상|자동 점검/);
    expect(text()).toContain("사용 중지");
    expect(text()).toContain("조회 실패");
  });

  it("fills each usage bar to its percentage with the tone for that level", () => {
    render({ view: VIEWS.ready, routerUrl: SAMPLE_ROUTER_URL });
    const fills = [...document.querySelectorAll('[role="meter"] > div')].map((el) => ({
      width: (el as HTMLElement).style.width,
      tone: Object.entries(BAR_TONE).find(([, cls]) => el.classList.contains(cls))?.[0],
    }));
    expect(fills).toEqual([
      { width: "42%", tone: "normal" },
      { width: "67%", tone: "normal" },
      { width: "91%", tone: "high" },
      { width: "99%", tone: "critical" },
    ]);
  });

  it("uses only bar tone classes the host stylesheet generates from ui/src", () => {
    // Tailwind builds host CSS by scanning ui/src only; plugin files are not
    // sources. A tone class absent from ui/src renders as an empty bar.
    const hostSrc = resolve(process.cwd(), "../../../ui/src");
    const tokens = new Set(
      readdirSync(hostSrc, { recursive: true, encoding: "utf8" })
        .filter((f) => /\.tsx?$/.test(f))
        .flatMap((f) => readFileSync(join(hostSrc, f), "utf8").split(/[\s"'`]+/)),
    );
    for (const cls of Object.values(BAR_TONE)) expect(tokens.has(cls), cls).toBe(true);
  });

  it("opens the existing router only through a validated URL with noopener noreferrer", () => {
    render({ view: VIEWS.ready, routerUrl: SAMPLE_ROUTER_URL });
    const links = [...document.querySelectorAll("a")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe(SAMPLE_ROUTER_URL);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it.each([undefined, null, "", "javascript:alert(1)", "http://router.example.test/", "https://user:pw@router.example.test/"])(
    "treats router URL %s as not configured",
    (routerUrl) => {
      render({ view: VIEWS.ready, routerUrl });
      expect(document.querySelectorAll("a").length).toBe(0);
      expect(button("기존 라우터 열기").disabled).toBe(true);
      expect(text()).toContain("라우터 주소 미설정");
    },
  );

  it("shows only critical alerts on the first screen: active account needing login", () => {
    render({ view: VIEWS.critical, routerUrl: SAMPLE_ROUTER_URL });
    expect(alerts()).toEqual(["Claude 재로그인 필요sample-claude-a재로그인↗"]);
    expect(text()).toContain("확인 필요");
    expect(text()).toContain("라우터 작업 진행 중");
    expect(text()).toContain("숨긴 계정 1");
    expect(text()).toContain("인증 만료 · 새 실행 실패");
  });

  it("renders the empty state per provider", () => {
    render({ view: VIEWS.empty });
    expect(text().match(/등록된 계정 없음/g)).toHaveLength(2);
    expect(alerts()).toEqual([]);
  });

  it("renders loading without account data or alerts", () => {
    render({ view: VIEWS.loading });
    expect(text()).toContain("불러오는 중");
    expect(text()).not.toContain("sample-");
    expect(alerts()).toEqual([]);
  });

  it("offline: alert with retry that only calls onRetry, and no stale account data", () => {
    const onRetry = vi.fn();
    render({ view: VIEWS.offline, onRetry });
    expect(alerts()[0]).toContain("라우터 응답 없음");
    expect(text()).toContain("계정 정보 없음");
    expect(text()).not.toContain("sample-");
    act(() => button("다시 확인").click());
    expect(onRetry).toHaveBeenCalledTimes(1);

    render({ view: VIEWS.offline, onRetry, retrying: true });
    const retry = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("다시 확인"));
    expect(retry?.disabled).toBe(true);
  });

  it("router rejection is shown as a read failure with a short label only", () => {
    render({ view: VIEWS.routerError });
    expect(alerts()[0]).toContain("라우터가 요청 거부");
    expect(text()).toContain("읽기 실패");
  });

  it("host-blocked read is shown as a read failure with retry, without account data", () => {
    const onRetry = vi.fn();
    render({ view: VIEWS.blocked, onRetry });
    expect(alerts()[0]).toContain("Paperclip이 연결 차단");
    expect(text()).toContain("읽기 실패");
    expect(text()).not.toContain("sample-");
  });

  it("denied after ready clears previously shown account data", () => {
    render({ view: VIEWS.ready, routerUrl: SAMPLE_ROUTER_URL });
    expect(text()).toContain("sample-gpt-a");
    render({ view: VIEWS.denied, routerUrl: SAMPLE_ROUTER_URL });
    expect(text()).not.toContain("sample-");
    expect(document.querySelectorAll('[role="meter"]').length).toBe(0);
    expect(alerts()[0]).toContain("접근 거부");
    expect(alerts()[0]).toContain("이 회사는 켜져 있지 않음");
    expect(text()).not.toContain("계정 전환 시 다음 작업부터 적용");
  });

  it("guide panel opens, focuses close, closes on Escape, and restores focus", () => {
    render({ view: VIEWS.ready });
    const trigger = button("설명서");
    act(() => {
      trigger.focus();
      trigger.click();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("설명서 닫기");
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("does not poll, time, or fetch on its own", () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render({ view: VIEWS.ready, routerUrl: SAMPLE_ROUTER_URL });
    render({ view: VIEWS.offline });
    expect(interval).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("view helpers", () => {
  it("maps action results and errors without keeping messages", () => {
    const state = readyState();
    expect(viewFromStateResult(state)).toEqual({ kind: "ready", state });
    const offline = { connection: "offline" as const, reason: "timeout" as const, checkedAt: state.fetchedAt };
    expect(viewFromStateResult(offline)).toEqual({ kind: "unavailable", result: offline });
    expect(viewFromActionError(new Error("account router access denied: company_not_enabled"))).toEqual({
      kind: "denied",
      reason: "company_not_enabled",
    });
    expect(viewFromActionError(new Error("upstream said: bearer sk-live-SECRET"))).toEqual({ kind: "denied", reason: "unknown" });
  });

  it("labels windows from seconds without assuming 5h/7d", () => {
    expect(formatWindow(18_000)).toBe("5시간");
    expect(formatWindow(604_800)).toBe("7일");
    expect(formatWindow(10_800)).toBe("3시간");
    expect(formatWindow(90)).toBe("90초");
    expect(formatWindow(null)).toBe("창 미제공");
  });

  it("accepts only https or loopback http router URLs", () => {
    expect(safeRouterUrl("https://router.example.test/x")).toBe("https://router.example.test/x");
    expect(safeRouterUrl("http://127.0.0.1:8765/codex-router/")).toBe("http://127.0.0.1:8765/codex-router/");
    expect(safeRouterUrl("http://router.example.test/")).toBeNull();
    expect(safeRouterUrl("data:text/html,x")).toBeNull();
  });
});
