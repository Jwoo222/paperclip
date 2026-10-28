import { Clock3 } from "lucide-react";
import type { CaseDetail, CaseHandoffView } from "@/api/cases";
import { AgentIdentity } from "@/components/AgentIdentity";
import type { AvatarAgent } from "@/components/AgentAvatar";
import { IssueReferencePill } from "@/components/IssueReferencePill";
import { IssueStatusBadge } from "@/components/StatusBadge";
import { PropertyRow } from "@/components/issue-properties/primitives";
import { t } from "@/i18n";

export type CaseAgentMap = ReadonlyMap<string, AvatarAgent & { status?: string }>;

export function CaseWorkSummary({ caseData, pendingHandoff, agents }: {
  caseData: CaseDetail;
  pendingHandoff?: CaseHandoffView | null;
  agents?: CaseAgentMap;
}) {
  const task = caseData.workIssue;
  const pending = pendingHandoff === undefined ? caseData.pendingHandoff : pendingHandoff;
  const assignee = task?.assigneeAgentId ? agents?.get(task.assigneeAgentId) ?? {
    id: task.assigneeAgentId,
    name: task.assigneeAgentName ?? t("auditRuntime.audit.agent"),
  } : null;
  const from = pending?.fromAgentId ? agents?.get(pending.fromAgentId)?.name ?? pending.fromAgentName ?? t("upgrade1029NewComponents.caseWorkSummary.previousAgent") : t("upgrade1029NewComponents.caseWorkSummary.previousAgent");
  const to = pending ? (pending.toAgentId ? agents?.get(pending.toAgentId)?.name : null) ?? pending.toAgentName ?? t("upgrade1029NewComponents.caseWorkSummary.receivingAgent") : null;
  const destination = pending?.toAgentId ? agents?.get(pending.toAgentId) : null;
  const waiting = pending?.destinationKind === "done" ? t("upgrade1029NewComponents.caseWorkSummary.closesWhenComplete") : pending?.lastError
    ?? (pending?.state === "awaiting_release" ? t("upgrade1029NewComponents.caseWorkSummary.waitingToFinish", { name: from })
      : destination?.status === "paused" ? t("upgrade1029NewComponents.caseWorkSummary.isPaused", { name: to }) : t("upgrade1029NewComponents.caseWorkSummary.waitingToStart", { name: to }));

  return <section className="space-y-3" aria-label={t("upgrade1029NewComponents.caseWorkSummary.caseWork")}>
    <h2 className="text-sm font-semibold">{t("upgrade1029NewComponents.caseWorkSummary.work")}</h2>
    {caseData.workIssueId ? <div className="space-y-3">
      {task ? <div>
        <PropertyRow label={t("coreNavigation.artifacts.task")}><IssueReferencePill issue={task} className="min-h-11 md:min-h-0" /></PropertyRow>
        <PropertyRow label={t("newUi.k2e2d5c5649b7")}><span className="text-sm">{caseData.workflow?.name ?? t("upgrade1029NewComponents.caseHandoffHistory.caseInstructions")}</span></PropertyRow>
        {caseData.phase && <PropertyRow label={t("upgrade1029NewComponents.caseListControls.column.phase")}><span className="text-sm">{caseData.phase}</span></PropertyRow>}
        <PropertyRow label={t("auditRuntime.audit.agent")}>{assignee ? <AgentIdentity agent={assignee} size="xs" /> : <span className="text-sm text-muted-foreground">{t("issueDetailResidual.unassigned")}</span>}</PropertyRow>
        <PropertyRow label={t("upgrade1029NewComponents.caseWorkSummary.taskStatus")}><IssueStatusBadge status={task.status} /></PropertyRow>
      </div> : <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.caseWorkSummary.primaryUnavailable")}</p>}
      {pending && pending.state !== "delivered" && pending.state !== "completed" && pending.state !== "cancelled" && <div className="flex items-start gap-2 text-sm">
        <Clock3 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          {pending.state === "awaiting_release" && <p>{t("upgrade1029NewComponents.caseWorkSummary.next", { name: pending.workflowTransition?.to.name ?? t("upgrade1029NewComponents.caseHandoffHistory.caseInstructions"), phase: pending.phase })}</p>}
          <p className="text-xs leading-relaxed text-muted-foreground">{waiting}</p>
        </div>
      </div>}
    </div> : <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.caseListRow.noTaskLinked")}</p>}
  </section>;
}
