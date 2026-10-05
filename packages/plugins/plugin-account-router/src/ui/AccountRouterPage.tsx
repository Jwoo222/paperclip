import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { KeyValueList, Spinner, StatusBadge, type StatusBadgeVariant } from "@paperclipai/plugin-sdk/ui";
import type { AccountSummary, UsageWindow } from "../sanitize.js";
import {
  DENIAL_LABEL,
  PROVIDER_LABEL,
  criticalLogins,
  formatPercent,
  formatTime,
  formatWindow,
  groupByProvider,
  safeRouterUrl,
  unavailableLabel,
  usageTone,
  usageWindows,
  type AccountRouterPageProps,
  type AccountRouterView,
  type ProviderGroup,
} from "./view.js";

// Classes are limited to Paperclip's semantic tokens (ui/src/index.css) and
// utilities the host stylesheet already ships; plugin bundles do not add CSS.

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const BUTTON_OUTLINE = `${BUTTON_BASE} h-9 border bg-background px-3 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50`;
const BUTTON_OUTLINE_SM = `${BUTTON_BASE} h-7 border bg-background px-2 text-xs shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50`;
const BUTTON_GHOST = `${BUTTON_BASE} h-9 px-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground`;
const BUTTON_ICON = `${BUTTON_BASE} size-9 text-muted-foreground hover:bg-accent hover:text-accent-foreground`;
const ALERT = "flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm";

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs tabular-nums">{children}</span>;
}

function RouterLink({ url, label, small }: { url: string | null; label: string; small?: boolean }) {
  if (!url) {
    return (
      <button type="button" disabled className={small ? BUTTON_OUTLINE_SM : BUTTON_OUTLINE} title="라우터 주소 미설정">
        {label}
      </button>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={small ? BUTTON_OUTLINE_SM : BUTTON_OUTLINE}>
      {label}
      <span aria-hidden>↗</span>
    </a>
  );
}

function RetryButton({ onRetry, retrying, small }: { onRetry?: () => void; retrying?: boolean; small?: boolean }) {
  if (!onRetry) return null;
  return (
    <button type="button" onClick={onRetry} disabled={retrying} className={small ? BUTTON_OUTLINE_SM : BUTTON_OUTLINE}>
      {retrying ? <Spinner label="다시 확인 중" /> : null}
      다시 확인
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Usage                                                               */
/* ------------------------------------------------------------------ */

// Same fill palette as the host's CodexSubscriptionPanel usage bars. Every class
// here must already exist in the host stylesheet (see tests/ui BAR_TONE check).
export const BAR_TONE = {
  none: "bg-muted-foreground/30",
  normal: "bg-primary/70",
  high: "bg-(--status-task-todo)",
  critical: "bg-destructive",
} as const;

function UsageMeter({ window }: { window: UsageWindow }) {
  const title = formatWindow(window.windowSeconds);
  const percent = formatPercent(window.usedPercent);
  const width = Math.max(0, Math.min(100, window.usedPercent ?? 0));
  const reset = formatTime(window.resetsAt);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{title}</span>
        <Mono>{percent ?? "—"}</Mono>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={window.usedPercent ?? undefined}
        aria-label={`${title} 사용률 ${percent ?? "미제공"}`}
      >
        <div className={`h-full rounded-full ${BAR_TONE[usageTone(window.usedPercent)]}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">
        {reset ? (
          <>
            초기화 <Mono>{reset}</Mono>
          </>
        ) : (
          "초기화 시각 미제공"
        )}
      </span>
    </div>
  );
}

function accountBadge(account: AccountSummary, isActive: boolean): [string, StatusBadgeVariant] {
  if (account.needsLogin) return ["재로그인 필요", isActive ? "error" : "warning"];
  if (account.disabled) return ["사용 중지", "pending"];
  if (account.usage?.failed) return ["조회 실패", "warning"];
  return isActive ? ["활성", "ok"] : ["대기", "info"];
}

/* ------------------------------------------------------------------ */
/* Provider section                                                    */
/* ------------------------------------------------------------------ */

function ProviderSection({ group, routerUrl }: { group: ProviderGroup; routerUrl: string | null }) {
  const headingId = useId();
  const { provider, active, others } = group;
  const total = others.length + (active ? 1 : 0);
  const windows = usageWindows(active);
  const [badgeLabel, badgeTone] = active ? accountBadge(active, true) : (["선택 전", "pending"] as [string, StatusBadgeVariant]);

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id={headingId} className="text-sm font-semibold">
          {PROVIDER_LABEL[provider]}
          <span className="ml-1.5 font-normal text-muted-foreground">계정 {total}</span>
        </h2>
      </header>

      {total === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">등록된 계정 없음</div>
      ) : (
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">활성 계정</div>
              <div className="mt-1 truncate text-lg font-semibold">{active?.alias ?? "선택 전"}</div>
            </div>
            <StatusBadge label={badgeLabel} status={badgeTone} />
          </div>

          {active?.needsLogin ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">인증 만료 · 새 실행 실패</p>
          ) : windows.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {windows.map((w, i) => (
                <UsageMeter key={i} window={w} />
              ))}
            </div>
          ) : active ? (
            <p className="text-sm text-muted-foreground">사용량 기록 없음</p>
          ) : null}

          {active ? (
            <KeyValueList
              pairs={[
                {
                  label: "마지막 조회",
                  value: (
                    <span>
                      <Mono>{formatTime(active.usage?.checkedAt) ?? "기록 없음"}</Mono>
                      {active.usage?.failed ? <span className="ml-2 text-destructive">조회 실패</span> : null}
                    </span>
                  ),
                },
              ]}
            />
          ) : null}
        </div>
      )}

      {others.length > 0 ? (
        <div className="border-t px-4 py-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">다른 계정</div>
          <ul className="flex flex-col">
            {others.map((account) => {
              const [label, tone] = accountBadge(account, false);
              const first = account.usage?.primary ?? null;
              const percent = formatPercent(first?.usedPercent);
              return (
                <li key={account.alias} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{account.alias}</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {percent ? (
                      <>
                        <Mono>{percent}</Mono> · {formatWindow(first?.windowSeconds)}
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                  <StatusBadge label={label} status={tone} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">전환은 기존 라우터에서</span>
        <RouterLink url={routerUrl} label="이 구역 관리" small />
      </footer>
    </section>
  );
}

function LoadingSection({ label }: { label: string }) {
  return (
    <section aria-busy="true" className="flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground">
      <header className="border-b px-4 py-3 text-sm font-semibold">{label}</header>
      <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
        <Spinner label="불러오는 중" />
        불러오는 중
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Guide (long explanations live here, not on the first screen)       */
/* ------------------------------------------------------------------ */

const OPERATIONS: { name: string; place: string }[] = [
  { name: "상태 보기 (활성 계정 · 사용률 · 마지막 조회)", place: "이 화면 (읽기 전용)" },
  { name: "계정 전환 · 자동 전환 점검", place: "기존 라우터" },
  { name: "사용량 새로고침 (Claude는 실제 모델 요청 발생)", place: "기존 라우터" },
  { name: "계정 추가 · 재로그인 · 보관", place: "기존 라우터" },
  { name: "전환 기준 · 자동 점검 설정", place: "기존 라우터" },
];

export function GuidePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const h = "text-sm font-semibold";
  const body = "text-sm text-muted-foreground";
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-md flex-col border-l bg-background text-foreground shadow-lg"
      >
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            계정 라우터 설명서
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="설명서 닫기" className={BUTTON_ICON}>
            <span aria-hidden>✕</span>
          </button>
        </header>
        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          <section className="flex flex-col gap-1.5">
            <h3 className={h}>계정을 바꾸면 무엇이 바뀌나요</h3>
            <p className={body}>
              이 Paperclip이 아니라 라우터가 관리하는 서버의 연결 대상이 바뀝니다. 그 서버에서 새로 시작하는 실행부터 적용되고, 이미 돌고 있는 실행은 바로 바뀌지
              않을 수 있습니다. 이 화면을 여는 것만으로는 아무것도 바뀌지 않습니다.
            </p>
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className={h}>여기서 하는 일과 기존 라우터에서 하는 일</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">조작</th>
                  <th className="py-1.5 font-medium">하는 곳</th>
                </tr>
              </thead>
              <tbody>
                {OPERATIONS.map((op) => (
                  <tr key={op.name} className="border-t align-top">
                    <td className="py-2 pr-3">{op.name}</td>
                    <td className="py-2">{op.place}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className={h}>사용률과 조회 시각</h3>
            <p className={body}>
              사용률은 라우터가 마지막으로 조회한 값입니다. 창 길이는 라우터가 알려준 값을 그대로 표시하고, 알려주지 않으면 “창 미제공”으로 둡니다. 90% 이상은 주황,
              98% 이상은 빨강입니다. 다른 계정 목록의 숫자는 각 계정의 첫 번째 창 기준입니다. 이 화면은 스스로 새로 읽지 않으므로 최신 값이 필요하면 “다시 확인”을
              누릅니다.
            </p>
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className={h}>빨간 알림이 떴을 때</h3>
            <ul className={`${body} flex list-disc flex-col gap-1 pl-4`}>
              <li>
                <b className="font-medium text-foreground">라우터 응답 없음 · 시간 초과</b> — 라우터 웹 서비스가 꺼졌거나 멈췄을 수 있습니다. 이 화면은 서비스를
                재시작하지 않고, 마지막 값도 보여주지 않습니다.
              </li>
              <li>
                <b className="font-medium text-foreground">Paperclip이 연결 차단</b> — Paperclip이 플러그인의 내부 주소 접속을 막고 있습니다. 승인된 연결 방식이
                생기기 전까지는 이 상태가 정상입니다. 보호를 풀지 않고 기술 담당(CTO)이 연결 방식을 정합니다.
              </li>
              <li>
                <b className="font-medium text-foreground">라우터 요청 거부 · 형식 오류</b> — 라우터 쪽 설정이나 버전이 바뀐 상태입니다. 보안 설정을 풀지 않고 기술
                담당(CTO)이 확인합니다.
              </li>
              <li>
                <b className="font-medium text-foreground">접근 거부</b> — 이 회사에서 계정 라우터 보기가 켜져 있지 않거나, 보드 사용자가 아닌 경우입니다. 켜는 일은
                인스턴스 관리자가 합니다. 거부되면 이전에 보이던 계정 정보도 지웁니다.
              </li>
              <li>
                <b className="font-medium text-foreground">재로그인 필요</b> — 활성 계정의 인증이 만료되어 그 서비스의 새 실행이 실패합니다. 기존 라우터에서 같은
                계정으로 다시 로그인합니다.
              </li>
            </ul>
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className={h}>보안</h3>
            <p className={body}>
              기존 라우터 화면은 Paperclip 안에 끼워 넣지 않고 새 창으로 엽니다. 이메일 · 요금제 · 파일 경로 · 로그인 코드 · 작업 메시지는 이 화면으로 넘어오지
              않습니다. 형식이 맞지 않는 계정 이름은 숨기고 개수만 표시합니다.
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function pageBadge(view: AccountRouterView, critical: number): [string, StatusBadgeVariant] | null {
  switch (view.kind) {
    case "loading":
      return null;
    case "ready":
      return critical > 0 ? ["확인 필요", "warning"] : ["연결됨", "ok"];
    case "unavailable":
      return view.result.connection === "offline" ? ["응답 없음", "error"] : ["읽기 실패", "error"];
    case "denied":
      return ["접근 거부", "error"];
  }
}

export function AccountRouterPage({ view, retrying = false, onRetry, routerUrl }: AccountRouterPageProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const url = safeRouterUrl(routerUrl);
  const critical = criticalLogins(view);
  const badge = pageBadge(view, critical.length);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-xl font-semibold">계정 라우터</h1>
          {badge ? <StatusBadge label={badge[0]} status={badge[1]} /> : <Spinner label="불러오는 중" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setGuideOpen(true)} className={BUTTON_GHOST}>
            설명서
          </button>
          <RouterLink url={url} label="기존 라우터 열기" />
        </div>
      </div>

      {!url ? <p className="text-xs text-muted-foreground">라우터 주소 미설정</p> : null}

      {view.kind === "unavailable" ? (
        <div role="alert" className={ALERT}>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{unavailableLabel(view.result.reason)}</span>
            {formatTime(view.result.checkedAt) ? (
              <span className="ml-2 text-muted-foreground">
                <Mono>{formatTime(view.result.checkedAt)}</Mono>
              </span>
            ) : null}
          </span>
          <RetryButton onRetry={onRetry} retrying={retrying} />
        </div>
      ) : null}

      {view.kind === "denied" ? (
        <div role="alert" className={ALERT}>
          <span className="min-w-0 flex-1">
            <span className="font-medium">접근 거부</span>
            <span className="ml-2 text-muted-foreground">{DENIAL_LABEL[view.reason]}</span>
          </span>
          <button type="button" onClick={() => setGuideOpen(true)} className="text-xs font-medium underline-offset-4 hover:underline">
            무엇인가요?
          </button>
        </div>
      ) : null}

      {critical.map((account) => (
        <div key={`${account.provider}:${account.alias}`} role="alert" className={ALERT}>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{PROVIDER_LABEL[account.provider]} 재로그인 필요</span>
            <span className="ml-2 text-muted-foreground">{account.alias}</span>
          </span>
          <RouterLink url={url} label="재로그인" small />
        </div>
      ))}

      {view.kind === "ready" || view.kind === "loading" ? (
        <p className="text-xs text-muted-foreground">계정 전환 시 다음 작업부터 적용</p>
      ) : null}

      {view.kind === "ready" && view.state.job?.status === "running" ? (
        <div role="status" className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <Spinner label="진행 중" />
          라우터 작업 진행 중
        </div>
      ) : null}
      {view.kind === "ready" && view.state.job?.status === "error" ? (
        <div className="flex items-center gap-2 text-sm">
          <StatusBadge label="라우터 작업 실패" status="warning" />
        </div>
      ) : null}

      {view.kind === "loading" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <LoadingSection label={PROVIDER_LABEL.codex} />
          <LoadingSection label={PROVIDER_LABEL.claude} />
        </div>
      ) : null}

      {view.kind === "ready" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {groupByProvider(view.state.accounts).map((group) => (
            <ProviderSection key={group.provider} group={group} routerUrl={url} />
          ))}
        </div>
      ) : null}

      {view.kind === "unavailable" || view.kind === "denied" ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">계정 정보 없음</div>
      ) : null}

      {view.kind === "ready" ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            수신 <Mono>{formatTime(view.state.fetchedAt) ?? "—"}</Mono>
          </span>
          {view.state.omittedAccountCount > 0 ? <span>숨긴 계정 {view.state.omittedAccountCount}</span> : null}
          <RetryButton onRetry={onRetry} retrying={retrying} small />
        </div>
      ) : null}

      <GuidePanel open={guideOpen} onClose={closeGuide} />
    </div>
  );
}
