import { useMemo, useState, type ReactNode } from "react";
import type { ActivityEvent, Issue, Agent } from "@paperclipai/shared";
import { isResponsibleUserDenialCode } from "@paperclipai/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { accessApi, type CurrentBoardAccess } from "../api/access";
import { activityApi, type RunForIssue, type RunLivenessState } from "../api/activity";
import { ApiError } from "../api/client";
import {
  heartbeatsApi,
  type ActiveRunForIssue,
  type LiveRunForIssue,
  type WatchdogDecisionInput,
} from "../api/heartbeats";
import { useToastActions } from "../context/ToastContext";
import { cn, relativeTime } from "../lib/utils";
import { queryKeys } from "../lib/queryKeys";
import { keepPreviousDataForSameQueryTail } from "../lib/query-placeholder-data";
import { describeRunRetryState, formatRetryReason } from "../lib/runRetryState";
import { readSourceResolvedWatchdogFold } from "../lib/source-resolved-watchdog-fold";
import { SourceResolvedFoldBadge } from "./SourceResolvedFoldBadge";
import { ResponsibleUserDenialNotice } from "./ResponsibleUserDenialNotice";
import { i18n, t, useTranslation } from "@/i18n";

type IssueRunLedgerProps = {
  issueId: string;
  companyId: string;
  issueStatus: Issue["status"];
  childIssues: Issue[];
  agentMap: ReadonlyMap<string, Agent>;
  hasLiveRuns: boolean;
  activityEvents?: ActivityEvent[];
  renderActivityEvent?: (event: ActivityEvent) => ReactNode;
  resolveUserLabel?: (userId: string) => string | null | undefined;
};

type IssueRunLedgerContentProps = {
  runs: RunForIssue[];
  liveRuns?: LiveRunForIssue[];
  activeRun?: ActiveRunForIssue | null;
  issueStatus: Issue["status"];
  childIssues: Issue[];
  agentMap: ReadonlyMap<string, Pick<Agent, "name">>;
  activityEvents?: ActivityEvent[];
  renderActivityEvent?: (event: ActivityEvent) => ReactNode;
  resolveUserLabel?: (userId: string) => string | null | undefined;
  pendingWatchdogDecision?: WatchdogDecisionInput["decision"] | null;
  canRecordWatchdogDecisions?: boolean;
  watchdogDecisionError?: string | null;
  onWatchdogDecision?: (input: WatchdogDecisionInput) => void;
};

type LedgerRun = RunForIssue & {
  isLive?: boolean;
  agentName?: string;
  outputSilence?: ActiveRunForIssue["outputSilence"];
};

type LedgerFeedItem =
  | {
      kind: "run";
      id: string;
      timestamp: string;
      run: LedgerRun;
    }
  | {
      kind: "activity";
      id: string;
      timestamp: string;
      event: ActivityEvent;
    };

type LivenessCopy = {
  label: string;
  tone: string;
  description: string;
};

function livenessCopy() {
  const copy: Record<RunLivenessState, LivenessCopy> = {
    completed: {
      label: t("taskDetail.completed"),
      tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      description: t("taskDetail.taskReachedTerminal"),
    },
    advanced: {
      label: t("taskDetail.advanced"),
      tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
      description: t("taskDetail.runProducedProgress"),
    },
    plan_only: {
      label: t("taskDetail.planOnly"),
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      description: t("taskDetail.planWithoutAction"),
    },
    empty_response: {
      label: t("taskDetail.emptyResponse"),
      tone: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
      description: t("taskDetail.runNoUsefulOutput"),
    },
    blocked: {
      label: t("taskDetail.blocked"),
      tone: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
      description: t("taskDetail.runDeclaredBlocker"),
    },
    failed: {
      label: t("taskDetail.failed"),
      tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
      description: t("taskDetail.runEndedUnsuccessfully"),
    },
    needs_followup: {
      label: t("taskDetail.needsFollowup"),
      tone: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
      description: t("taskDetail.runNeedsFollowup"),
    },
  };
  return copy;
}

function pendingLivenessCopy(): LivenessCopy {
  return {
    label: t("taskDetail.checksAfterFinish"),
    tone: "border-border bg-background text-muted-foreground",
    description: t("taskDetail.livenessAfterFinish"),
  };
}

function retryPendingLivenessCopy(): LivenessCopy {
  return {
    label: t("taskDetail.retryPending"),
    tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    description: t("taskDetail.automaticRetryPending"),
  };
}

function missingLivenessCopy(): LivenessCopy {
  return {
    label: t("taskDetail.noLivenessData"),
    tone: "border-border bg-background text-muted-foreground",
    description: t("taskDetail.noPersistedLiveness"),
  };
}

const TERMINAL_CHILD_STATUSES = new Set<Issue["status"]>(["done", "cancelled"]);
const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);

type RunOutputSilenceLevel = NonNullable<ActiveRunForIssue["outputSilence"]>["level"];

type RunOutputSilenceCopy = {
  label: string;
  tone: string;
};

function runOutputSilenceCopy(level: RunOutputSilenceLevel): RunOutputSilenceCopy | null {
  if (level === "suspicious") {
    return {
      label: t("taskDetailExtra.silenceWatch"),
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    };
  }
  if (level === "critical") {
    return {
      label: t("taskDetailExtra.staleRun"),
      tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    };
  }
  if (level === "snoozed") {
    return {
      label: t("taskDetailExtra.silenceSnoozed"),
      tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    };
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

interface ModelProfileSummary {
  requested: string;
  applied: string | null;
  configSource: string | null;
  fallbackReason: string | null;
}

function modelProfileForRun(run: RunForIssue): ModelProfileSummary | null {
  const result = asRecord(run.resultJson);
  const profile = asRecord(result?.modelProfile);
  if (!profile) return null;
  const requested = readString(profile.requested);
  if (!requested) return null;
  return {
    requested,
    applied: readString(profile.applied),
    configSource: readString(profile.configSource),
    fallbackReason: readString(profile.fallbackReason),
  };
}

function modelProfileBadgeTone(summary: ModelProfileSummary) {
  if (summary.applied === summary.requested) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (summary.fallbackReason) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-background text-muted-foreground";
}

function modelProfileTitle(summary: ModelProfileSummary) {
  const lines = [t("taskDetailExtra.profileRequested", { profile: summary.requested })];
  if (summary.applied) lines.push(t("taskDetailExtra.profileApplied", { profile: summary.applied }));
  if (summary.configSource) lines.push(t("taskDetailExtra.profileSource", { source: summary.configSource }));
  if (summary.fallbackReason) lines.push(t("taskDetailExtra.profileFallback", { reason: summary.fallbackReason }));
  return lines.join("\n");
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDuration(start: string | Date | null | undefined, end: string | Date | null | undefined) {
  if (!start) return null;
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (totalSeconds < 60) return t("taskDetailExtra.durationSeconds", { count: totalSeconds });
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    const minutePart = t("taskDetailExtra.durationMinutes", { count: minutes });
    return seconds > 0
      ? `${minutePart} ${t("taskDetailExtra.durationSeconds", { count: seconds })}`
      : minutePart;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hourPart = t("taskDetailExtra.durationHours", { count: hours });
  return remainingMinutes > 0
    ? `${hourPart} ${t("taskDetailExtra.durationMinutes", { count: remainingMinutes })}`
    : hourPart;
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function liveRunToLedgerRun(run: LiveRunForIssue | ActiveRunForIssue): LedgerRun {
  return {
    runId: run.id,
    status: run.status,
    agentId: run.agentId,
    agentName: run.agentName,
    adapterType: run.adapterType,
    startedAt: toIsoString(run.startedAt),
    finishedAt: toIsoString(run.finishedAt),
    createdAt: toIsoString(run.createdAt) ?? new Date().toISOString(),
    invocationSource: run.invocationSource,
    usageJson: null,
    resultJson: null,
    isLive: run.status === "queued" || run.status === "running",
    outputSilence: run.outputSilence,
  };
}

function mergeRuns(
  runs: RunForIssue[],
  liveRuns: LiveRunForIssue[] | undefined,
  activeRun: ActiveRunForIssue | null | undefined,
) {
  const byId = new Map<string, LedgerRun>();
  for (const run of runs) byId.set(run.runId, run);
  for (const run of liveRuns ?? []) {
    const existing = byId.get(run.id);
    byId.set(
      run.id,
      existing
        ? { ...existing, isLive: true, agentName: run.agentName, outputSilence: run.outputSilence }
        : liveRunToLedgerRun(run),
    );
  }
  if (activeRun) {
    const existing = byId.get(activeRun.id);
    if (existing) {
      byId.set(activeRun.id, {
        ...existing,
        isLive: isActiveRun(existing) || isActiveRun(activeRun),
        agentName: activeRun.agentName,
        outputSilence: activeRun.outputSilence,
      });
    } else {
      byId.set(activeRun.id, liveRunToLedgerRun(activeRun));
    }
  }

  return [...byId.values()].sort((a, b) => {
    const aTime = new Date(a.startedAt ?? a.createdAt).getTime();
    const bTime = new Date(b.startedAt ?? b.createdAt).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return b.runId.localeCompare(a.runId);
  });
}

function statusLabel(status: string) {
  if (status === "backlog") return t("taskDetailExtra.statusBacklog");
  if (status === "todo") return t("taskDetailExtra.statusTodo");
  if (status === "in_progress") return t("taskDetailExtra.statusInProgress");
  if (status === "in_review") return t("taskDetailExtra.statusInReview");
  if (status === "done") return t("taskDetailExtra.statusDone");
  if (status === "blocked") return t("taskDetailExtra.statusBlocked");
  if (status === "cancelled") return t("taskDetailExtra.statusCancelled");
  if (status === "queued") return t("taskDetailExtra.statusQueued");
  if (status === "running") return t("taskDetailExtra.statusRunning");
  if (status === "scheduled_retry") return t("taskDetailExtra.statusScheduledRetry");
  return status;
}

function isActiveRun(run: Pick<LedgerRun, "status" | "isLive">) {
  return run.isLive || ACTIVE_RUN_STATUSES.has(run.status);
}

function runSummary(run: LedgerRun, agentMap: ReadonlyMap<string, Pick<Agent, "name">>) {
  const agentName = compactAgentName(run, agentMap);
  if (run.status === "running") return t("taskDetailExtra.runRunningBy", { agent: agentName });
  if (run.status === "queued") return t("taskDetailExtra.runQueuedFor", { agent: agentName });
  if (run.status === "scheduled_retry") return t("taskDetailExtra.runAutomaticRetryFor", { agent: agentName });
  return t("taskDetailExtra.runStatusBy", { status: statusLabel(run.status), agent: agentName });
}

function livenessCopyForRun(run: LedgerRun) {
  if (run.status === "scheduled_retry") return retryPendingLivenessCopy();
  if (run.livenessState) return livenessCopy()[run.livenessState];
  return isActiveRun(run) ? pendingLivenessCopy() : missingLivenessCopy();
}

function stopReasonLabel(run: RunForIssue) {
  const result = asRecord(run.resultJson);
  const stopReason = readString(result?.stopReason);
  const timeoutFired = result?.timeoutFired === true;
  const effectiveTimeoutSec = readNumber(result?.effectiveTimeoutSec);
  const timeoutText =
    effectiveTimeoutSec && effectiveTimeoutSec > 0
      ? t("taskDetailExtra.timeoutLimit", { count: effectiveTimeoutSec })
      : null;

  if (timeoutFired || stopReason === "timeout") {
    return timeoutText ? t("taskDetailExtra.timeoutWithValue", { value: timeoutText }) : t("taskDetailExtra.timeout");
  }
  if (stopReason === "max_turns_exhausted" || stopReason === "turn_limit_exhausted") return t("taskDetailExtra.maxTurnsExhausted");
  if (stopReason === "budget_paused") return t("taskDetailExtra.budgetPaused");
  if (stopReason === "cancelled") return t("taskDetailExtra.cancelledStop");
  if (stopReason === "paused") return t("taskDetailExtra.pausedByBoard");
  if (stopReason === "process_lost") return t("taskDetailExtra.processLost");
  if (stopReason === "unmanaged_background_task_stopped") return t("taskDetailExtra.backgroundTaskStopped");
  if (stopReason === "adapter_failed") return t("taskDetailExtra.adapterFailed");
  if (stopReason === "completed") return timeoutText ? t("taskDetailExtra.completedWithTimeout", { value: timeoutText }) : t("taskDetailExtra.completedStop");
  return timeoutText;
}

function stopStatusLabel(run: LedgerRun, stopReason: string | null) {
  if (stopReason) return stopReason;
  if (run.status === "scheduled_retry") return t("taskDetailExtra.stopRetryPending");
  if (run.status === "queued") return t("taskDetailExtra.stopWaitingToStart");
  if (run.status === "running") return t("taskDetailExtra.stopStillRunning");
  if (!run.livenessState) return t("taskDetailExtra.unavailable");
  return t("taskDetailExtra.noStopReason");
}

function lastUsefulActionLabel(run: LedgerRun) {
  if (run.status === "scheduled_retry") return t("taskDetailExtra.waitingForNextAttempt");
  if (run.lastUsefulActionAt) return relativeTime(run.lastUsefulActionAt, i18n.resolvedLanguage);
  if (isActiveRun(run)) return t("taskDetailExtra.noActionRecordedYet");
  if (run.livenessState === "plan_only" || run.livenessState === "needs_followup") {
    return t("taskDetailExtra.noConcreteAction");
  }
  if (run.livenessState === "empty_response") return t("taskDetailExtra.noUsefulOutput");
  if (!run.livenessState) return t("taskDetailExtra.unavailable");
  return t("taskDetailExtra.noneRecorded");
}

function continuationLabel(run: LedgerRun) {
  if (!run.continuationAttempt || run.continuationAttempt <= 0) return null;
  return t("taskDetailExtra.continuationAttempt", { count: run.continuationAttempt });
}

function hasExhaustedContinuation(run: RunForIssue) {
  return /continuation attempts exhausted/i.test(run.livenessReason ?? "");
}

function childIssueSummary(childIssues: Issue[]) {
  const active = childIssues.filter((issue) => !TERMINAL_CHILD_STATUSES.has(issue.status));
  const done = childIssues.filter((issue) => issue.status === "done").length;
  const cancelled = childIssues.filter((issue) => issue.status === "cancelled").length;
  return { active, done, cancelled, total: childIssues.length };
}

function compactAgentName(run: LedgerRun, agentMap: ReadonlyMap<string, Pick<Agent, "name">>) {
  return run.agentName ?? agentMap.get(run.agentId)?.name ?? run.agentId.slice(0, 8);
}

function formatSilenceAge(ms: number | null | undefined) {
  if (!ms || ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return t("taskDetailExtra.underMinute");
  if (totalMinutes < 60) return t("taskDetailExtra.durationMinutes", { count: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return t("taskDetailExtra.durationHours", { count: hours });
  return `${t("taskDetailExtra.durationHours", { count: hours })} ${t("taskDetailExtra.durationMinutes", { count: minutes })}`;
}

function localizedRetryReason(reason: string | null | undefined) {
  if (reason === "transient_failure") return t("taskDetailExtra.retryReasonTransientFailure");
  if (reason === "missing_issue_comment") return t("taskDetailExtra.retryReasonMissingComment");
  if (reason === "process_lost") return t("taskDetailExtra.retryReasonProcessLost");
  if (reason === "assignment_recovery") return t("taskDetailExtra.retryReasonAssignmentRecovery");
  if (reason === "issue_continuation_needed") return t("taskDetailExtra.retryReasonContinuationNeeded");
  if (reason === "max_turns_continuation") return t("taskDetailExtra.retryReasonMaxTurns");
  return formatRetryReason(reason);
}

function localizedRunDateTime(date: string | Date) {
  const locale = i18n.resolvedLanguage?.toLowerCase().startsWith("ko") ? "ko-KR" : "en-US";
  return new Date(date).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localizedRetryState(
  run: LedgerRun,
  state: NonNullable<ReturnType<typeof describeRunRetryState>>,
) {
  const continuation = run.scheduledRetryReason === "max_turns_continuation";
  const attempt = typeof run.scheduledRetryAttempt === "number" && run.scheduledRetryAttempt > 0
    ? t("taskDetailExtra.attempt", { count: run.scheduledRetryAttempt })
    : null;
  const reason = localizedRetryReason(run.scheduledRetryReason);
  const detailParts = [attempt, reason];
  if (state.kind === "exhausted") detailParts.push(t("taskDetailExtra.automaticRetriesExhausted"));
  const detail = detailParts.filter((part): part is string => Boolean(part)).join(" · ") || null;
  const dueAt = run.scheduledRetryAt ? localizedRunDateTime(run.scheduledRetryAt) : null;
  const secondary = state.kind === "scheduled"
    ? dueAt
      ? t(continuation ? "taskDetailExtra.nextContinuation" : "taskDetailExtra.nextRetry", { date: dueAt })
      : t(continuation ? "taskDetailExtra.nextContinuationPending" : "taskDetailExtra.nextRetryPending")
    : state.kind === "exhausted" && run.retryExhaustedReason
      ? run.retryExhaustedReason.includes("Manual intervention required")
        ? run.retryExhaustedReason
        : `${run.retryExhaustedReason} ${t("taskDetailExtra.manualInterventionRequired")}`
      : null;
  const badgeLabel = state.kind === "scheduled"
    ? t(continuation ? "taskDetailExtra.continuationScheduled" : "taskDetailExtra.retryScheduled")
    : state.kind === "exhausted"
      ? t(continuation ? "taskDetailExtra.continuationExhausted" : "taskDetailExtra.retryExhausted")
      : t(continuation ? "taskDetailExtra.continuedRun" : "taskDetailExtra.retriedRun");
  return { ...state, badgeLabel, detail, secondary };
}

function canBoardRecordWatchdogDecision(
  companyId: string,
  boardAccess: CurrentBoardAccess | undefined,
) {
  if (!boardAccess) return false;
  if (boardAccess.source === "local_implicit" || boardAccess.isInstanceAdmin) return true;

  const membership = boardAccess.memberships?.find(
    (item) => item.companyId === companyId && item.status === "active",
  );
  if (!membership) return boardAccess.companyIds.includes(companyId) && !boardAccess.memberships;
  return membership.membershipRole !== "viewer" && membership.membershipRole !== null;
}

function watchdogDecisionErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return t("taskDetailExtra.onlyBoardRecoveryOwner");
  }
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : t("taskDetailExtra.watchdogRecordFailed");
}

export function IssueRunLedger({
  issueId,
  companyId,
  issueStatus,
  childIssues,
  agentMap,
  hasLiveRuns,
  activityEvents,
  renderActivityEvent,
  resolveUserLabel,
}: IssueRunLedgerProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const [watchdogDecisionError, setWatchdogDecisionError] = useState<string | null>(null);
  const { data: boardAccess } = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    retry: false,
  });
  const { data: runs } = useQuery({
    queryKey: queryKeys.issues.runs(issueId),
    queryFn: () => activityApi.runsForIssue(issueId),
    refetchInterval: hasLiveRuns || issueStatus === "in_progress" ? 5000 : false,
    placeholderData: keepPreviousDataForSameQueryTail<RunForIssue[]>(issueId),
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(issueId),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issueId),
    enabled: hasLiveRuns,
    refetchInterval: 3000,
    placeholderData: keepPreviousDataForSameQueryTail<LiveRunForIssue[]>(issueId),
  });
  const { data: activeRun = null } = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId),
    enabled: hasLiveRuns || issueStatus === "in_progress",
    refetchInterval: hasLiveRuns ? false : 3000,
    placeholderData: keepPreviousDataForSameQueryTail<ActiveRunForIssue | null>(issueId),
  });
  const watchdogDecision = useMutation({
    mutationFn: (input: WatchdogDecisionInput) => heartbeatsApi.recordWatchdogDecision(input),
    onMutate: () => {
      setWatchdogDecisionError(null);
    },
    onSuccess: () => {
      setWatchdogDecisionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId) });
    },
    onError: (error) => {
      const message = watchdogDecisionErrorMessage(error);
      const dedupeSuffix = error instanceof ApiError ? String(error.status) : "error";
      setWatchdogDecisionError(message);
      pushToast({
        title: t("taskDetailExtra.watchdogNotRecorded"),
        body: message,
        tone: "error",
        dedupeKey: `watchdog-decision:${issueId}:${dedupeSuffix}`,
      });
    },
  });

  return (
    <IssueRunLedgerContent
      runs={runs ?? []}
      liveRuns={liveRuns}
      activeRun={activeRun}
      issueStatus={issueStatus}
      childIssues={childIssues}
      agentMap={agentMap}
      activityEvents={activityEvents}
      renderActivityEvent={renderActivityEvent}
      resolveUserLabel={resolveUserLabel}
      pendingWatchdogDecision={watchdogDecision.variables?.decision ?? null}
      canRecordWatchdogDecisions={canBoardRecordWatchdogDecision(companyId, boardAccess)}
      watchdogDecisionError={watchdogDecisionError}
      onWatchdogDecision={(input) => watchdogDecision.mutate(input)}
    />
  );
}

export function IssueRunLedgerContent({
  runs,
  liveRuns,
  activeRun,
  issueStatus,
  childIssues,
  agentMap,
  activityEvents,
  renderActivityEvent,
  resolveUserLabel,
  pendingWatchdogDecision,
  canRecordWatchdogDecisions = true,
  watchdogDecisionError,
  onWatchdogDecision,
}: IssueRunLedgerContentProps) {
  useTranslation();
  const ledgerRuns = useMemo(() => mergeRuns(runs, liveRuns, activeRun), [activeRun, liveRuns, runs]);
  const latestRun = ledgerRuns[0] ?? null;
  const latestSilentRun = useMemo(
    () =>
      ledgerRuns.find((run) =>
        isActiveRun(run)
        && (run.outputSilence?.level === "critical" || run.outputSilence?.level === "suspicious"),
      ) ?? null,
    [ledgerRuns],
  );
  const children = childIssueSummary(childIssues);
  const canRenderActivityEvents = Boolean(renderActivityEvent);
  const feedItems = useMemo<LedgerFeedItem[]>(() => {
    const items: LedgerFeedItem[] = [];
    for (const run of ledgerRuns) {
      items.push({
        kind: "run",
        id: run.runId,
        timestamp: run.startedAt ?? run.createdAt,
        run,
      });
    }
    if (canRenderActivityEvents) {
      for (const event of activityEvents ?? []) {
        items.push({
          kind: "activity",
          id: event.id,
          timestamp: event.createdAt instanceof Date
            ? event.createdAt.toISOString()
            : String(event.createdAt),
          event,
        });
      }
    }
    return items.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      if (aTime !== bTime) return bTime - aTime;
      if (a.kind !== b.kind) return a.kind === "run" ? -1 : 1;
      return b.id.localeCompare(a.id);
    });
  }, [activityEvents, canRenderActivityEvents, ledgerRuns]);

  return (
    <section className="space-y-3" aria-label={t("taskDetailExtra.runLedger")}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-muted-foreground">{t("taskDetailExtra.runLedger")}</h3>
          <p className="text-xs text-muted-foreground">
            {latestRun
              ? runSummary(latestRun, agentMap)
              : issueStatus === "in_progress"
                ? t("taskDetailExtra.waitingFirstRun")
                : t("taskDetailExtra.noRuns")}
          </p>
        </div>
        {latestRun ? (
          <Link
            to={`/agents/${latestRun.agentId}/runs/${latestRun.runId}`}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("taskDetailExtra.latestRun")}
          </Link>
        ) : null}
      </div>

      {children.total > 0 ? (
        <div className="rounded-md border border-border/70 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-foreground">{t("taskDetailExtra.childWork")}</span>
            <span className="text-muted-foreground">
              {children.active.length > 0
                ? t("taskDetailExtra.childWorkActiveSummary", {
                    active: children.active.length,
                    done: children.done,
                    cancelled: children.cancelled,
                  })
                : t("taskDetailExtra.childWorkTerminalSummary", {
                    total: children.total,
                    done: children.done,
                    cancelled: children.cancelled,
                  })}
            </span>
          </div>
          {children.active.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {children.active.slice(0, 4).map((child) => (
                <Link
                  key={child.id}
                  to={`/issues/${child.identifier ?? child.id}`}
                  className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-(length:--text-micro) hover:bg-accent/40"
                >
                  <span className="shrink-0 font-mono text-muted-foreground">{child.identifier ?? child.id.slice(0, 8)}</span>
                  <span className="truncate">{child.title}</span>
                  <span className="shrink-0 text-muted-foreground">{statusLabel(child.status)}</span>
                </Link>
              ))}
              {children.active.length > 4 ? (
                <span className="rounded-md border border-border px-2 py-1 text-(length:--text-micro) text-muted-foreground">
                  {t("taskDetailExtra.moreCount", { count: children.active.length - 4 })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {latestSilentRun?.outputSilence ? (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            latestSilentRun.outputSilence.level === "critical"
              ? "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
          )}
        >
          <p className="font-medium">
            {latestSilentRun.outputSilence.level === "critical"
              ? t("taskDetailExtra.staleRunAlert")
              : t("taskDetailExtra.silenceWarning")}
          </p>
          <p className="mt-1">
            {t("taskDetailExtra.latestActiveSilent", {
              duration: formatSilenceAge(latestSilentRun.outputSilence.silenceAgeMs)
                ?? t("taskDetailExtra.extendedPeriod"),
            })}
            {latestSilentRun.outputSilence.evaluationIssueIdentifier ? (
              <>
                {" "}
                {t("taskDetailExtra.review")}{" "}
                <Link
                  to={`/issues/${latestSilentRun.outputSilence.evaluationIssueIdentifier}`}
                  className="font-medium underline underline-offset-2"
                >
                  {latestSilentRun.outputSilence.evaluationIssueIdentifier}
                </Link>
                {" "}{t("taskDetailExtra.forRecoveryContext")}
              </>
            ) : null}
          </p>
          {onWatchdogDecision && canRecordWatchdogDecisions ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded-md border border-border bg-background/80 px-2 py-1 text-(length:--text-micro) text-foreground hover:bg-background"
                onClick={() =>
                  onWatchdogDecision({
                    runId: latestSilentRun.runId,
                    decision: "continue",
                    evaluationIssueId: latestSilentRun.outputSilence?.evaluationIssueId ?? null,
                  })}
                disabled={pendingWatchdogDecision != null}
              >
                {t("taskDetailExtra.continueMonitoring")}
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-background/80 px-2 py-1 text-(length:--text-micro) text-foreground hover:bg-background"
                onClick={() =>
                  onWatchdogDecision({
                    runId: latestSilentRun.runId,
                    decision: "snooze",
                    evaluationIssueId: latestSilentRun.outputSilence?.evaluationIssueId ?? null,
                    snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                    reason: "Snoozed from issue run ledger",
                  })}
                disabled={pendingWatchdogDecision != null}
              >
                {t("taskDetailExtra.snoozeOneHour")}
              </button>
              <button
                type="button"
                className="rounded-md border border-border bg-background/80 px-2 py-1 text-(length:--text-micro) text-foreground hover:bg-background"
                onClick={() =>
                  onWatchdogDecision({
                    runId: latestSilentRun.runId,
                    decision: "dismissed_false_positive",
                    evaluationIssueId: latestSilentRun.outputSilence?.evaluationIssueId ?? null,
                    reason: "Dismissed from issue run ledger",
                  })}
                disabled={pendingWatchdogDecision != null}
              >
                {t("taskDetailExtra.markFalsePositive")}
              </button>
            </div>
          ) : null}
          {watchdogDecisionError ? (
            <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-(length:--text-micro) text-red-900 dark:text-red-200">
              {watchdogDecisionError}
            </p>
          ) : null}
        </div>
      ) : null}

      {feedItems.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {renderActivityEvent
            ? t("taskDetailExtra.noHistory")
            : t("taskDetailExtra.historicalNoLiveness")}
        </div>
      ) : (
        <div className="space-y-1.5">
          {feedItems.slice(0, 20).map((item) => {
            if (item.kind === "activity") {
              return <div key={`activity:${item.id}`}>{renderActivityEvent?.(item.event)}</div>;
            }
            const run = item.run;
            const liveness = livenessCopyForRun(run);
            const stopReason = stopReasonLabel(run);
            const duration = formatDuration(run.startedAt, run.finishedAt);
            const exhausted = hasExhaustedContinuation(run);
            const continuation = continuationLabel(run);
            const rawRetryState = describeRunRetryState(run);
            const retryState = rawRetryState ? localizedRetryState(run, rawRetryState) : null;
            const agentName = compactAgentName(run, agentMap);
            const onBehalfOfLabel = run.responsibleUserId
              ? resolveUserLabel?.(run.responsibleUserId)?.trim() || t("taskDetailExtra.responsibleUser")
              : null;
            const denialCode = isResponsibleUserDenialCode(run.errorCode) ? run.errorCode : null;
            const sourceResolvedFold = readSourceResolvedWatchdogFold(run.resultJson);
            const outputSilenceCopy = run.outputSilence
              ? runOutputSilenceCopy(run.outputSilence.level)
              : null;
            return (
              <article
                key={`run:${run.runId}`}
                className="space-y-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs text-muted-foreground"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{t("taskDetailExtra.runLabel")}</span>
                  <Link
                    to={`/agents/${run.agentId}/runs/${run.runId}`}
                    className="min-w-0 max-w-full truncate font-mono text-foreground hover:underline"
                  >
                    {run.runId.slice(0, 8)}
                  </Link>
                  <span>{t("taskDetailExtra.byAgent", { agent: agentName })}</span>
                  {onBehalfOfLabel ? (
                    <span
                      data-testid="run-on-behalf-of"
                      className="min-w-0 max-w-full truncate text-muted-foreground"
                      title={t("taskDetailExtra.actingOnBehalfOf", { label: onBehalfOfLabel })}
                    >
                      {t("taskDetailExtra.onBehalfOf", { label: onBehalfOfLabel })}
                    </span>
                  ) : null}
                  <span className="rounded-md border border-border px-1.5 py-0.5 text-(length:--text-micro) capitalize text-muted-foreground">
                    {statusLabel(run.status)}
                  </span>
                  {run.isLive ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-(length:--text-micro) text-blue-700 dark:text-blue-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {t("taskDetailExtra.live")}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
                      liveness.tone,
                    )}
                    title={liveness.description}
                  >
                    {liveness.label}
                  </span>
                  {exhausted ? (
                    <span className="rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-(length:--text-micro) font-medium text-red-700 dark:text-red-300">
                      {t("taskDetailExtra.exhausted")}
                    </span>
                  ) : null}
                  {continuation ? (
                    <span className="text-(length:--text-micro) text-muted-foreground">{continuation}</span>
                  ) : null}
                  {retryState ? (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
                        retryState.tone,
                      )}
                    >
                      {retryState.badgeLabel}
                    </span>
                  ) : null}
                  {outputSilenceCopy ? (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
                        outputSilenceCopy.tone,
                      )}
                    >
                      {outputSilenceCopy.label}
                    </span>
                  ) : null}
                  {(() => {
                    const profile = modelProfileForRun(run);
                    if (!profile) return null;
                    const label = profile.applied === profile.requested
                      ? t("taskDetailExtra.runProfile", { profile: profile.requested })
                      : profile.applied
                        ? t("taskDetailExtra.runProfileApplied", {
                            requested: profile.requested,
                            applied: profile.applied,
                          })
                        : t("taskDetailExtra.runProfileUnavailable", { requested: profile.requested });
                    return (
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
                          modelProfileBadgeTone(profile),
                        )}
                        title={modelProfileTitle(profile)}
                      >
                        {label}
                      </span>
                    );
                  })()}
                  {sourceResolvedFold ? <SourceResolvedFoldBadge /> : null}
                  <span className="ml-auto shrink-0">{relativeTime(item.timestamp, i18n.resolvedLanguage)}</span>
                </div>

                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div className="min-w-0">
                    <span className="text-foreground">{t("taskDetailExtra.elapsedLabel")}</span>{" "}
                    {duration ?? t("taskDetailExtra.unknownDuration")}
                  </div>
                  <div className="min-w-0">
                    <span className="text-foreground">{t("taskDetailExtra.lastUsefulActionLabel")}</span>{" "}
                    {lastUsefulActionLabel(run)}
                  </div>
                  <div className="min-w-0">
                    <span className="text-foreground">{t("taskDetailExtra.stopLabel")}</span>{" "}
                    {stopStatusLabel(run, stopReason)}
                  </div>
                </div>

                {retryState ? (
                  <div className="rounded-md border border-border/70 bg-accent/20 px-2 py-2 text-xs leading-5 text-muted-foreground">
                    {retryState.detail ? <p>{retryState.detail}</p> : null}
                    {retryState.secondary ? <p>{retryState.secondary}</p> : null}
                    {retryState.retryOfRunId ? (
                      <p>
                        {t("taskDetailExtra.retryOf")}{" "}
                        <Link
                          to={`/agents/${run.agentId}/runs/${retryState.retryOfRunId}`}
                          className="font-mono text-foreground hover:underline"
                        >
                          {retryState.retryOfRunId.slice(0, 8)}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {(() => {
                  const profile = modelProfileForRun(run);
                  if (!profile?.fallbackReason || profile.applied === profile.requested) return null;
                  return (
                    <p className="min-w-0 break-words text-(length:--text-micro) leading-5 text-amber-700 dark:text-amber-300">
                      {profile.requested === "cheap"
                        ? t("taskDetailExtra.cheapFallback")
                        : t("taskDetailExtra.profileUnavailable", { profile: profile.requested })}
                      {": "}
                      <span className="font-mono">{profile.fallbackReason}</span>
                    </p>
                  );
                })()}

                {run.livenessReason ? (
                  <p className="min-w-0 break-words text-xs leading-5 text-muted-foreground">
                    {run.livenessReason}
                  </p>
                ) : null}

                {denialCode ? (
                  <ResponsibleUserDenialNotice
                    code={denialCode}
                    userName={run.responsibleUserId ? resolveUserLabel?.(run.responsibleUserId) : null}
                  />
                ) : null}

                {run.nextAction ? (
                  <div className="min-w-0 rounded-md bg-accent/40 px-2 py-1.5 text-xs leading-5">
                    <span className="font-medium text-foreground">{t("taskDetailExtra.nextActionLabel")}</span>
                    <span className="break-words text-muted-foreground">{run.nextAction}</span>
                  </div>
                ) : null}
              </article>
            );
          })}
          {feedItems.length > 20 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("taskDetailExtra.olderItemsNotShown", { count: feedItems.length - 20 })}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
