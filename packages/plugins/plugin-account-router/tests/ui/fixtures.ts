import type { AccountSummary, RouterStateSummary } from "../../src/sanitize.js";
import type { AccountRouterView } from "../../src/ui/view.js";

/** Sample data only. Aliases and times are invented and match the sanitized DTO shape. */
const FETCHED_AT = "2026-09-28T00:41:12.000Z";

function account(partial: Partial<AccountSummary> & Pick<AccountSummary, "provider" | "alias">): AccountSummary {
  return { active: false, needsLogin: false, disabled: false, usage: null, ...partial };
}

export function readyState(options: { claudeNeedsLogin?: boolean; jobRunning?: boolean; omitted?: number } = {}): RouterStateSummary {
  return {
    connection: "online",
    fetchedAt: FETCHED_AT,
    omittedAccountCount: options.omitted ?? 0,
    job: options.jobRunning ? { status: "running" } : null,
    accounts: [
      account({
        provider: "codex",
        alias: "sample-gpt-a",
        active: true,
        usage: {
          checkedAt: "2026-09-28T00:36:00.000Z",
          failed: false,
          primary: { usedPercent: 42, resetsAt: "2026-09-28T03:10:00.000Z", windowSeconds: 18_000 },
          secondary: { usedPercent: 67, resetsAt: "2026-10-01T00:00:00.000Z", windowSeconds: 604_800 },
        },
      }),
      account({
        provider: "codex",
        alias: "sample-gpt-b",
        usage: {
          checkedAt: "2026-09-28T00:36:00.000Z",
          failed: false,
          primary: { usedPercent: 8, resetsAt: null, windowSeconds: 18_000 },
          secondary: null,
        },
      }),
      account({ provider: "codex", alias: "sample-gpt-c", disabled: true }),
      options.claudeNeedsLogin
        ? account({
            provider: "claude",
            alias: "sample-claude-a",
            active: true,
            needsLogin: true,
            usage: { checkedAt: "2026-09-27T23:50:00.000Z", failed: true, primary: null, secondary: null },
          })
        : account({
            provider: "claude",
            alias: "sample-claude-a",
            active: true,
            usage: {
              checkedAt: "2026-09-28T00:21:00.000Z",
              failed: false,
              // Non-5h window on purpose: labels must follow windowSeconds.
              primary: { usedPercent: 91, resetsAt: "2026-09-28T02:00:00.000Z", windowSeconds: 10_800 },
              secondary: { usedPercent: 99, resetsAt: null, windowSeconds: 604_800 },
            },
          }),
      account({
        provider: "claude",
        alias: "sample-claude-b",
        usage: { checkedAt: "2026-09-28T00:05:00.000Z", failed: true, primary: null, secondary: null },
      }),
    ],
  };
}

export const VIEWS = {
  loading: { kind: "loading" },
  ready: { kind: "ready", state: readyState() },
  critical: { kind: "ready", state: readyState({ claudeNeedsLogin: true, jobRunning: true, omitted: 1 }) },
  empty: {
    kind: "ready",
    state: { connection: "online", fetchedAt: FETCHED_AT, accounts: [], omittedAccountCount: 0, job: null },
  },
  offline: { kind: "unavailable", result: { connection: "offline", reason: "offline", checkedAt: FETCHED_AT } },
  blocked: { kind: "unavailable", result: { connection: "error", reason: "blocked_by_host", checkedAt: FETCHED_AT } },
  routerError: { kind: "unavailable", result: { connection: "error", reason: "rejected_by_router", checkedAt: FETCHED_AT } },
  denied: { kind: "denied", reason: "company_not_enabled" },
} satisfies Record<string, AccountRouterView>;

export type ViewName = keyof typeof VIEWS;

/** Harness-only address. Never used as a production default. */
export const SAMPLE_ROUTER_URL = "https://router.example.test/codex-router/";
