import { RouterReadError } from "./router-client.js";

/**
 * Allowlist DTOs. Everything the router returns that is not copied here
 * explicitly (email, plan, target paths, CSRF token, login codes, event and
 * job messages, history, settings, public URL) is dropped.
 */

export const PROVIDERS = ["codex", "claude"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const JOB_STATUSES = ["running", "done", "error"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number] | "unknown";

export const MAX_ACCOUNTS = 100;

export interface UsageWindow {
  usedPercent: number | null;
  resetsAt: string | null;
  windowSeconds: number | null;
}

export interface UsageSnapshot {
  checkedAt: string | null;
  failed: boolean;
  primary: UsageWindow | null;
  secondary: UsageWindow | null;
}

export interface AccountSummary {
  provider: Provider;
  alias: string;
  active: boolean;
  needsLogin: boolean;
  disabled: boolean;
  usage: UsageSnapshot | null;
}

export interface RouterHealth {
  connection: "online";
  service: "codex-router-web";
  version: number;
  checkedAt: string;
}

export interface RouterStateSummary {
  connection: "online";
  fetchedAt: string;
  accounts: AccountSummary[];
  /** Accounts dropped because they did not match the expected shape. */
  omittedAccountCount: number;
  job: { status: JobStatus } | null;
}

// Mirrors label_value() in the router: 1-48 word chars, dots, or hyphens.
// Rejects anything that could be an email address or a path.
const ALIAS_PATTERN = /^[\p{L}\p{N}_-][\p{L}\p{N}_.-]{0,47}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeAlias(value: unknown): string | null {
  if (typeof value !== "string" || !ALIAS_PATTERN.test(value)) return null;
  if (value === "." || value === "..") return null;
  return value;
}

function safeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function safeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function safeWindow(value: unknown): UsageWindow | null {
  if (!isRecord(value)) return null;
  const windowSeconds = safeNumber(value.window_seconds, 1, 366 * 24 * 3600);
  return {
    usedPercent: safeNumber(value.used, 0, 1000),
    resetsAt: safeTimestamp(value.reset_at),
    windowSeconds: windowSeconds === null ? null : Math.trunc(windowSeconds),
  };
}

function safeUsage(value: unknown): UsageSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    checkedAt: safeTimestamp(value.at),
    failed: value.error === true,
    primary: safeWindow(value.primary),
    secondary: safeWindow(value.secondary),
  };
}

function safeJob(value: unknown): RouterStateSummary["job"] {
  if (!isRecord(value)) return null;
  const status = (JOB_STATUSES as readonly unknown[]).includes(value.status)
    ? (value.status as JobStatus)
    : "unknown";
  return { status };
}

export function sanitizeHealth(raw: unknown, now: Date = new Date()): RouterHealth {
  if (!isRecord(raw) || raw.service !== "codex-router-web") {
    throw new RouterReadError("schema_mismatch");
  }
  const version = safeNumber(raw.version, 0, 1_000_000);
  if (version === null) throw new RouterReadError("schema_mismatch");
  return { connection: "online", service: "codex-router-web", version, checkedAt: now.toISOString() };
}

export function sanitizeState(raw: unknown, now: Date = new Date()): RouterStateSummary {
  if (!isRecord(raw) || !Array.isArray(raw.accounts)) {
    throw new RouterReadError("schema_mismatch");
  }
  const activeCodex = typeof raw.active === "string" ? raw.active : null;
  const activeClaude = typeof raw.activeClaude === "string" ? raw.activeClaude : null;

  const accounts: AccountSummary[] = [];
  let omitted = 0;
  for (const entry of raw.accounts) {
    if (accounts.length >= MAX_ACCOUNTS) {
      omitted += 1;
      continue;
    }
    if (!isRecord(entry)) {
      omitted += 1;
      continue;
    }
    const alias = safeAlias(entry.label);
    const provider = (PROVIDERS as readonly unknown[]).includes(entry.provider)
      ? (entry.provider as Provider)
      : null;
    if (!alias || !provider) {
      omitted += 1;
      continue;
    }
    const activeLabel = provider === "claude" ? activeClaude : activeCodex;
    accounts.push({
      provider,
      alias,
      active: activeLabel === alias,
      needsLogin: entry.needsLogin === true,
      disabled: entry.disabled === true,
      usage: safeUsage(entry.probe),
    });
  }

  return {
    connection: "online",
    fetchedAt: now.toISOString(),
    accounts,
    omittedAccountCount: omitted,
    job: safeJob(raw.job),
  };
}
