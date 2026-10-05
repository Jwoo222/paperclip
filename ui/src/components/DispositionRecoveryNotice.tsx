import { t } from "@/i18n";
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import type { Agent, Issue, IssueCommentMetadata, IssueRecoveryAction } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/timeAgo";

export type DispositionRecoverySnapshot = NonNullable<IssueCommentMetadata["recovery"]>;
export type DispositionRecoveryContextValue = {
  issue: Pick<Issue, "status" | "assigneeAgentId" | "executionRunId" | "checkoutRunId" | "executionState" | "blockedBy"> & {
    activeRecoveryAction?: Pick<IssueRecoveryAction, "id" | "status" | "kind" | "ownerType" | "returnOwnerAgentId" | "wakePolicy"> & { evidence?: IssueRecoveryAction["evidence"] } | null;
  };
  agentMap?: ReadonlyMap<string, Pick<Agent, "name" | "status">>;
  hasPendingInteraction?: boolean;
  unavailableReason?: string | null;
  onRetry: (actionId: string) => Promise<void>;
};

const RecoveryContext = createContext<DispositionRecoveryContextValue | null>(null);
export function DispositionRecoveryProvider({ value, children }: { value: DispositionRecoveryContextValue; children: ReactNode }) {
  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}

/** Older notices can be identified by their stored action/run IDs, never their copy. */
export function readDispositionRecoverySnapshot(metadata: IssueCommentMetadata | null | undefined, action?: DispositionRecoveryContextValue["issue"]["activeRecoveryAction"]): DispositionRecoverySnapshot | null {
  if (metadata?.recovery?.kind === "disposition_repair_escalated") return metadata.recovery;
  if (!metadata || !action || action.kind !== "deliberate_wait_without_target" || action.ownerType !== "board" || action.wakePolicy?.type !== "board_escalation") return null;
  const evidence = action.evidence;
  if (!metadata.sourceRunId || metadata.sourceRunId !== evidence?.latestRunId) return null;
  if (!metadata.sections.some(section => section.rows.some(row => row.type === "key_value" && row.value === action.id))) return null;
  if (typeof evidence.terminalReason !== "string" || typeof evidence.sourceAttemptCount !== "number" || !Number.isInteger(evidence.sourceAttemptCount) || evidence.sourceAttemptCount < 0 || typeof evidence.sourceMaxAttempts !== "number" || !Number.isInteger(evidence.sourceMaxAttempts) || evidence.sourceMaxAttempts <= 0) return null;
  return { kind: "disposition_repair_escalated", actionId: action.id, attemptCount: evidence.sourceAttemptCount, maxAttempts: evidence.sourceMaxAttempts, reason: evidence.terminalReason, assigneeAgentId: action.returnOwnerAgentId };
}

export function useDispositionRecoverySnapshot(metadata: IssueCommentMetadata | null | undefined) {
  return readDispositionRecoverySnapshot(metadata, useContext(RecoveryContext)?.issue.activeRecoveryAction);
}

/** UI affordance only; the server rechecks the current action and all execution gates. */
export function dispositionRetryUnavailableReason(snapshot: DispositionRecoverySnapshot, context: DispositionRecoveryContextValue | null): string | null {
  if (!context) return t("upgrade2610Task.openTaskToReviewState");
  const { issue } = context;
  const action = issue.activeRecoveryAction;
  if (!action || action.id !== snapshot.actionId || action.status !== "active") return t("upgrade2610Task.recoveryNoticeInactive");
  if (issue.status !== "blocked") return t("upgrade2610Task.taskStateChangedReview");
  if (action.kind !== "deliberate_wait_without_target" || action.ownerType !== "board" || action.wakePolicy?.type !== "board_escalation") return t("upgrade2610Task.recoveryStateChanged");
  if (!snapshot.assigneeAgentId || issue.assigneeAgentId !== snapshot.assigneeAgentId || action.returnOwnerAgentId !== snapshot.assigneeAgentId) return t("upgrade2610Task.assignedAgentChanged");
  if (context.unavailableReason) return context.unavailableReason;
  if (context.hasPendingInteraction) return t("upgrade2610Task.respondToPendingBeforeRetry");
  if (issue.executionRunId || issue.checkoutRunId) return t("upgrade2610Task.taskHasActiveRun");
  if (issue.executionState?.status === "pending") return t("upgrade2610Task.taskWaitingForReview");
  if (issue.blockedBy?.some(blocker => blocker.status !== "done" && blocker.status !== "cancelled")) return t("upgrade2610Task.resolveBlockersBeforeRetry");
  const agent = context.agentMap?.get(snapshot.assigneeAgentId);
  if (agent?.status === "paused") return t("upgrade2610Task.assignedAgentPaused");
  if (agent?.status === "terminated") return t("upgrade2610Task.assignedAgentUnavailable");
  return null;
}

function descriptionFor(snapshot: DispositionRecoverySnapshot) {
  const start = t("upgrade2610Task.agentStoppedWithoutOutcome");
  if (snapshot.reason === "owner_budget_blocked") return `${start} ${t("upgrade2610Task.recoveryStoppedBudget")}`;
  if (snapshot.reason === "owner_not_invokable") return `${start} ${t("upgrade2610Task.recoveryStoppedAgentUnavailable")}`;
  if (snapshot.reason === "unchanged_source_state_exhausted") {
    const attempts = snapshot.attemptCount === 2 ? t("upgrade2610Task.two") : String(snapshot.attemptCount);
    return `${start} ${t("upgrade2610Task.automaticAttemptsFailed", { count: snapshot.attemptCount, attempts })}`;
  }
  return `${start} ${t("upgrade2610Task.recoveryStoppedReviewDetails")}`;
}

/** Same component in both task interfaces and Storybook; no prose controls actions. */
export function DispositionRecoveryNotice({ snapshot, createdAt, defaultExpanded = false }: {
  snapshot: DispositionRecoverySnapshot;
  createdAt?: string;
  defaultExpanded?: boolean;
}) {
  const context = useContext(RecoveryContext);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const detailsId = useId();
  const titleId = useId();
  const unavailableId = useId();
  const unavailableReason = dispositionRetryUnavailableReason(snapshot, context);
  const historical = Boolean(context && context.issue.activeRecoveryAction?.id !== snapshot.actionId);
  const agentName = (snapshot.assigneeAgentId && context?.agentMap?.get(snapshot.assigneeAgentId)?.name) || t("upgrade2610Task.theAssignedAgent");
  const HeadingIcon = requested || historical ? Check : TriangleAlert;

  async function retry() {
    if (!context || unavailableReason || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await context.onRetry(snapshot.actionId);
      setRequested(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("upgrade2610Task.refreshTaskThenRetry"));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 gap-2.5 py-3" data-testid="disposition-recovery-notice">
      <HeadingIcon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", requested || historical ? "text-muted-foreground" : "text-(--status-task-icon-todo)")} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <h2 id={titleId} className="break-words text-sm font-medium text-foreground">
            {requested ? t("upgrade2610Task.retryRequested") : historical ? t("upgrade2610Task.agentNeededAttention") : t("upgrade2610Task.agentNeedsAttention")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {requested ? t("upgrade2610Task.taskReturnedToTodo", { agentName }) : descriptionFor(snapshot)}
          </p>
        </div>
        {unavailableReason && !requested ? (
          <p id={unavailableId} className="text-xs leading-relaxed text-muted-foreground">
            {!historical && <span className="font-medium text-foreground">{t("upgrade2610Task.retryUnavailable")} </span>}{unavailableReason}
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{t("upgrade2610Task.couldNotConfirmRetry")} {error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {!requested && !historical ? (
            <Button size="xs" variant="outline" disabled={pending || Boolean(unavailableReason)} aria-describedby={unavailableReason ? unavailableId : undefined} onClick={() => void retry()}>
              {pending ? <Loader2 aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" /> : <RotateCcw aria-hidden="true" className="size-3" />}
              {pending ? t("upgrade2610Task.requestingRetry") : t("upgrade2610Task.retryAgent")}
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" className="text-muted-foreground" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(current => !current)}>
            {expanded ? t("upgrade2610Task.hideDetails") : t("upgrade2610Task.viewDetails")}
            <ChevronDown aria-hidden="true" className={cn("size-3", expanded && "rotate-180")} />
          </Button>
          {createdAt ? <time dateTime={createdAt} className="font-mono text-xs text-muted-foreground sm:ml-auto">{timeAgo(createdAt)}</time> : null}
        </div>
        {expanded ? (
          <div id={detailsId} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <dl className="flex flex-col gap-2 text-xs">
              <div className="flex flex-wrap justify-between gap-1"><dt className="text-muted-foreground">{t("upgrade2610Task.assignedWhenRecoveryStopped")}</dt><dd>{agentName}</dd></div>
              <div className="flex flex-wrap justify-between gap-1"><dt className="text-muted-foreground">{t("upgrade2610Task.automaticAttempts")}</dt><dd className="font-mono">{t("upgrade2610Task.attemptsOf", { attempts: snapshot.attemptCount, max: snapshot.maxAttempts })}</dd></div>
              <div className="flex flex-wrap justify-between gap-1"><dt className="text-muted-foreground">{t("upgrade2610Task.automaticRetriesForRecovery")}</dt><dd>{t("newUi.k1a4f630ac1b6")}</dd></div>
            </dl>
            <p className="text-xs leading-relaxed text-muted-foreground">{t("upgrade2610Task.recoveryRetryExplanation")}</p>
            <div className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">{t("upgrade2610Task.technicalReason")}</span><code className="break-all font-mono text-xs">{snapshot.reason}</code></div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
