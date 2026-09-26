import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import type {
  Issue,
  IssuePriority,
  IssueStatus,
  RoutineRunSummary,
  RoutineTrigger,
} from "@paperclipai/shared";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@paperclipai/shared";
import { CalendarClock, Clock3, Play, Repeat, UserRound } from "lucide-react";
import { IssueRow } from "@/components/IssueRow";
import { MarkdownBody } from "@/components/MarkdownBody";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { createIssueDetailLocationState } from "@/lib/issueDetailBreadcrumb";
import { Link } from "@/lib/router";
import {
  routineDetailHref,
} from "./RoutineContextualSidebar";
import { useRoutineDetail } from "./routine-sections/context";

export type RoutineScheduleSummary = {
  label: string;
  detail: string;
  nextRunAt: Date | null;
};

export function formatRoutineTimestamp(value: Date | string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function summarizeRoutineSchedule(triggers: RoutineTrigger[]): RoutineScheduleSummary {
  const schedules = triggers.filter((trigger) => trigger.kind === "schedule" && trigger.enabled);
  const nextRunAt = schedules
    .map((trigger) => trigger.nextRunAt ? new Date(trigger.nextRunAt) : null)
    .filter((value): value is Date => value !== null && Number.isFinite(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;

  if (schedules.length === 0) {
    const webhooks = triggers.filter((trigger) => trigger.kind === "webhook" && trigger.enabled);
    if (webhooks.length > 0) {
      return {
        label: `${webhooks.length} active webhook${webhooks.length === 1 ? "" : "s"}`,
        detail: tNewUi("newUi.kf933c52c48bf"),
        nextRunAt: null,
      };
    }
    return { label: tNewUi("newUi.k4624e546d7a6"), detail: tNewUi("newUi.k729e7cd364c1"), nextRunAt: null };
  }

  const first = schedules[0]!;
  return {
    label: schedules.length === 1 ? tNewUi("newUi.kfb3df61785ee") : `${schedules.length} active schedules`,
    detail: first.cronExpression
      ? `${first.cronExpression}${first.timezone ? ` · ${first.timezone}` : ""}`
      : first.label ?? tNewUi("newUi.k3e1c417b9687"),
    nextRunAt,
  };
}

function normalizeIssueStatus(value: string): IssueStatus {
  return ISSUE_STATUSES.includes(value as IssueStatus) ? value as IssueStatus : "todo";
}

function normalizeIssuePriority(value: string): IssuePriority {
  return ISSUE_PRIORITIES.includes(value as IssuePriority) ? value as IssuePriority : "medium";
}

/** Display-only adapter for the canonical task row; run summaries intentionally carry compact task data. */
export function routineRunIssue(
  summary: NonNullable<RoutineRunSummary["linkedIssue"]>,
  run: RoutineRunSummary,
  companyId: string,
  projectId: string | null,
): Issue {
  return {
    ...summary,
    companyId,
    projectId,
    projectWorkspaceId: null,
    goalId: null,
    parentId: null,
    description: null,
    status: normalizeIssueStatus(summary.status),
    workMode: "standard",
    priority: normalizeIssuePriority(summary.priority),
    reviewPolicy: null,
    assigneeAgentId: null,
    assigneeUserId: null,
    checkoutRunId: null,
    executionRunId: null,
    executionAgentNameKey: null,
    executionLockedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    responsibleUserId: null,
    issueNumber: null,
    originKind: "routine_execution",
    originId: run.routineId,
    originRunId: run.id,
    requestDepth: 0,
    billingCode: null,
    assigneeAdapterOverrides: null,
    executionWorkspaceId: null,
    executionWorkspacePreference: null,
    executionWorkspaceSettings: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    hiddenAt: null,
    createdAt: run.triggeredAt,
  };
}

function OverviewFact({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Clock3;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="min-w-0 text-sm font-medium text-foreground">{value}</div>
      {detail ? <div className="min-w-0 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function RoutineOverview() {
  const { routine, routineRuns, currentAssignee, hasLiveRun } = useRoutineDetail();
  const schedule = summarizeRoutineSchedule(routine.triggers);
  const hasWebhook = routine.triggers.some((trigger) => trigger.kind === "webhook" && trigger.enabled);
  const sortedRuns = [...(routineRuns ?? [])].sort(
    (left, right) => new Date(right.triggeredAt).getTime() - new Date(left.triggeredAt).getTime(),
  );
  const lastRun = sortedRuns[0] ?? null;
  const recentRuns = sortedRuns.slice(0, 5);
  const detailOrigin = createIssueDetailLocationState(
    routine.title,
    routineDetailHref(routine.id),
    "issues",
  );
  const automationState = routine.status === "archived"
    ? "archived"
    : !routine.assigneeAgentId
      ? "draft"
      : routine.status;

  return (
    <div className="flex flex-col gap-6" data-routine-overview-mode="read">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewFact
          icon={Repeat}
          label={t("secretsSupport.state")}
          value={<StatusBadge status={automationState} />}
          detail={hasLiveRun ? tNewUi("newUi.k6b03c610b7e0") : tNewUi("newUi.k87e6c43b902c")}
        />
        <OverviewFact
          icon={CalendarClock}
          label={t("coreWorkflow.triggers")}
          value={schedule.label}
          detail={<span className="font-mono">{schedule.detail}</span>}
        />
        <OverviewFact
          icon={Clock3}
          label={tNewUi("newUi.kb3c0ab96930c")}
          value={schedule.nextRunAt ? formatRoutineTimestamp(schedule.nextRunAt) : hasWebhook ? tNewUi("newUi.k1c487dc1fa8c") : tNewUi("newUi.kb3e24789bf8d")}
          detail={schedule.nextRunAt ? tNewUi("newUi.k4724f344c1c0") : hasWebhook ? tNewUi("newUi.k042e1123f4c5") : tNewUi("newUi.kdfefacb8c018")}
        />
        <OverviewFact
          icon={Play}
          label={t("routinesExtra.sort.lastRun")}
          value={lastRun ? <StatusBadge status={lastRun.status} /> : tNewUi("newUi.k306b45db2016")}
          detail={lastRun ? formatRoutineTimestamp(lastRun.triggeredAt) : tNewUi("newUi.k0977c0406034")}
        />
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="routine-agent-heading">
        <h2 id="routine-agent-heading" className="text-sm font-semibold">{t("routinesExtra.fields.defaultAgent")}</h2>
        {currentAssignee ? (
          <Link
            to={`/agents/${currentAssignee.urlKey ?? currentAssignee.id}`}
            className="flex w-fit items-center gap-2 rounded-md text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {currentAssignee.name}
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">{tNewUi("newUi.kd047f6c7a3af")}</p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="routine-description-heading">
        <h2 id="routine-description-heading" className="text-sm font-semibold">{t("skillStudio.description")}</h2>
        {routine.description?.trim() ? (
          <MarkdownBody className="text-sm text-foreground" linkIssueReferences>
            {routine.description}
          </MarkdownBody>
        ) : (
          <p className="text-sm text-muted-foreground">{t("toolsProfiles.detail.noDescription")}</p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="routine-recent-runs-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="routine-recent-runs-heading" className="text-sm font-semibold">{tNewUi("newUi.k237112b89b77")}</h2>
          <Button variant="ghost" size="sm" asChild>
            <Link to={routineDetailHref(routine.id, "runs")}>{tNewUi("newUi.k346de5a03a7a")}</Link>
          </Button>
        </div>
        {recentRuns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tNewUi("newUi.k1d0eb00e615c")}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {recentRuns.map((run) => run.linkedIssue ? (
              <IssueRow
                key={run.id}
                issue={routineRunIssue(run.linkedIssue, run, routine.companyId, routine.projectId)}
                issueLinkState={detailOrigin}
                presentation="task"
                metadata={(
                  <span className="flex items-center gap-2">
                    <StatusBadge status={run.status} />
                    <span className="font-mono text-xs text-muted-foreground">{formatRoutineTimestamp(run.triggeredAt)}</span>
                  </span>
                )}
              />
            ) : (
              <div key={run.id} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm">
                <StatusBadge status={run.status} />
                <span className="min-w-0 flex-1 truncate">{run.trigger?.label ?? tNewUi("newUi.kdda37a7a9c9f")}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatRoutineTimestamp(run.triggeredAt)}</span>
              </div>
            ))}
          </div>
        )}
        <Button variant="link" size="sm" className="w-fit px-0" asChild>
          <Link to={routineDetailHref(routine.id, "activity")}>{tNewUi("newUi.kcd1bd79b5900")}</Link>
        </Button>
      </section>
    </div>
  );
}
