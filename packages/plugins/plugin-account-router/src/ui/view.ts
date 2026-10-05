import type { AccessDenialReason } from "../access.js";
import type { AccountSummary, Provider, RouterStateSummary, UsageWindow } from "../sanitize.js";
import type { RouterUnavailable, StateResult } from "../worker.js";

/**
 * Props contract for the account router page (presentation only).
 *
 * The container that calls the `router-state` action owns fetching. This
 * module never fetches, polls, or caches: every render shows exactly the
 * view it is given. A `denied` or `unavailable` view carries no account data,
 * so switching to it clears whatever was shown before.
 */
export type AccountRouterView =
  | { kind: "loading" }
  | { kind: "ready"; state: RouterStateSummary }
  | { kind: "unavailable"; result: RouterUnavailable }
  | { kind: "denied"; reason: AccessDenialReason | "unknown" };

export interface AccountRouterPageProps {
  view: AccountRouterView;
  /** True while a retry started by `onRetry` is in flight. */
  retrying?: boolean;
  /** Re-run the read once. The page never retries on its own. */
  onRetry?: () => void;
  /**
   * Existing router UI address, supplied by the host after validation. Shown
   * as an external link only when it passes `safeRouterUrl`; otherwise the
   * open action is disabled. There is no default address.
   */
  routerUrl?: string | null;
}

const DENIAL_REASONS: readonly AccessDenialReason[] = [
  "board_user_required",
  "company_scope_required",
  "company_mismatch",
  "company_not_enabled",
];

/** Maps a `router-state` action result to a view. */
export function viewFromStateResult(result: StateResult): AccountRouterView {
  return result.connection === "online" ? { kind: "ready", state: result } : { kind: "unavailable", result };
}

/**
 * Maps a thrown action error to a `denied` view. Only the known denial code is
 * kept; the error message itself is never rendered.
 */
export function viewFromActionError(error: unknown): AccountRouterView {
  // The host bridge throws a plain `PluginBridgeError` object ({ code, message }), not an Error.
  const message = typeof error === "object" && error !== null ? (error as { message?: unknown }).message : error;
  const text = typeof message === "string" ? message : "";
  const reason = DENIAL_REASONS.find((code) => text.includes(code)) ?? "unknown";
  return { kind: "denied", reason };
}

/** Accepts only absolute https URLs, or http on loopback. Anything else is treated as not configured. */
export { safeRouterUrl } from "../router-url.js";

export const PROVIDER_ORDER: readonly Provider[] = ["codex", "claude"];
export const PROVIDER_LABEL: Record<Provider, string> = { codex: "GPT · Codex", claude: "Claude" };

/** Machine timestamps use one numeric format (DESIGN.md principle 6). */
export function formatTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** Window length label from the router's own `windowSeconds`. Never assumes 5 h / 7 d. */
export function formatWindow(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "창 미제공";
  const day = 86_400;
  const hour = 3_600;
  if (seconds % day === 0) return `${seconds / day}일`;
  if (seconds % hour === 0) return `${seconds / hour}시간`;
  if (seconds % 60 === 0) return `${seconds / 60}분`;
  return `${seconds}초`;
}

export function formatPercent(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(value * 10) / 10}%`;
}

export type UsageTone = "none" | "normal" | "high" | "critical";

export function usageTone(value: number | null | undefined): UsageTone {
  if (typeof value !== "number" || !Number.isFinite(value)) return "none";
  if (value >= 98) return "critical";
  if (value >= 90) return "high";
  return "normal";
}

export function usageWindows(account: AccountSummary | null): UsageWindow[] {
  if (!account?.usage) return [];
  return [account.usage.primary, account.usage.secondary].filter((w): w is UsageWindow => w !== null);
}

export interface ProviderGroup {
  provider: Provider;
  active: AccountSummary | null;
  others: AccountSummary[];
}

export function groupByProvider(accounts: readonly AccountSummary[]): ProviderGroup[] {
  return PROVIDER_ORDER.map((provider) => {
    const mine = accounts.filter((a) => a.provider === provider);
    const active = mine.find((a) => a.active) ?? null;
    return { provider, active, others: mine.filter((a) => a !== active) };
  });
}

/** Active accounts that need login stop new runs for that provider: the only critical account alert. */
export function criticalLogins(view: AccountRouterView): AccountSummary[] {
  if (view.kind !== "ready") return [];
  return view.state.accounts.filter((a) => a.active && a.needsLogin);
}

export const UNAVAILABLE_LABEL: Record<RouterUnavailable["reason"], string> = {
  offline: "라우터 응답 없음",
  timeout: "라우터 응답 시간 초과",
  blocked_by_host: "Paperclip이 연결 차단",
  redirect_blocked: "라우터 응답 차단됨",
  rejected_by_router: "라우터가 요청 거부",
  http_error: "라우터 오류 응답",
  unexpected_content_type: "라우터 응답 형식 오류",
  too_large: "라우터 응답 크기 초과",
  invalid_json: "라우터 응답 형식 오류",
  schema_mismatch: "라우터 응답 형식 오류",
};

export function unavailableLabel(reason: RouterUnavailable["reason"]): string {
  return UNAVAILABLE_LABEL[reason] ?? "라우터 읽기 실패";
}

export const DENIAL_LABEL: Record<AccessDenialReason | "unknown", string> = {
  board_user_required: "보드 사용자만 볼 수 있음",
  company_scope_required: "회사 선택 필요",
  company_mismatch: "회사 정보 불일치",
  company_not_enabled: "이 회사는 켜져 있지 않음",
  unknown: "접근 거부",
};
