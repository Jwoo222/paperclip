import { t as tNewUi } from "@/i18n";
import { isLockedIssueStub, LockedIssueChip } from "@/components/LockedIssueChip";
import type { Issue, IssueStatus, IssueLockedStub } from "@paperclipai/shared";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IssueRow } from "@/components/IssueRow";
import { StatusIcon } from "@/components/StatusIcon";
import {
  createIssueDetailPath,
  rememberIssueDetailLocationState,
} from "@/lib/issueDetailBreadcrumb";
import { Link } from "@/lib/router";

export interface TaskDetailRelationItem {
  id: string;
  identifier?: string | null;
  title: string;
  status?: string | null;
}

export function RelationNavigationList({
  items,
  emptyMessage,
  ariaLabel,
  issueLinkState,
}: {
  items: (TaskDetailRelationItem | IssueLockedStub)[];
  emptyMessage: string;
  ariaLabel: string;
  issueLinkState?: unknown;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5" aria-label={ariaLabel}>
      {items.map((item) => {
        if (isLockedIssueStub(item)) {
          return <li key={item.id} className="px-2 py-2"><LockedIssueChip identifier={item.identifier} /></li>;
        }
        const pathId = item.identifier ?? item.id;
        return (
          <li key={item.id}>
            <Link
              to={createIssueDetailPath(pathId)}
              state={issueLinkState}
              onClickCapture={() => rememberIssueDetailLocationState(pathId, issueLinkState)}
              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={`${item.identifier ? `${item.identifier} — ` : ""}${item.title}`}
            >
              {item.status ? (
                <StatusIcon status={item.status} className="h-3.5 w-3.5 shrink-0" />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {item.identifier ? (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {item.identifier}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const NEXT_SUBTASK_STATUS_ORDER: IssueStatus[] = [
  "in_progress",
  "in_review",
  "todo",
  "backlog",
  "blocked",
];

export function resolveTaskDetailSubtaskState(items: Issue[]) {
  const nextAction = NEXT_SUBTASK_STATUS_ORDER
    .map((status) => items.find((item) => item.status === status))
    .find((item): item is Issue => Boolean(item)) ?? null;
  const rootBlocker = nextAction?.status === "blocked"
    ? nextAction.blockerAttention?.terminalBlocker ?? null
    : null;

  return {
    nextAction,
    rootBlocker,
    remainingItems: nextAction
      ? items.filter((item) => item.id !== nextAction.id)
      : items,
  };
}

export function TaskDetailTaskList({
  items,
  ariaLabel,
  issueLinkState,
}: {
  items: Issue[];
  ariaLabel: string;
  issueLinkState?: unknown;
}) {
  return (
    <ul className="flex flex-col gap-0.5" aria-label={ariaLabel}>
      {items.map((item) => (
        <li key={item.id}>
          <IssueRow
            issue={item}
            issueLinkState={issueLinkState}
            presentation="task"
            className="rounded-md"
          />
        </li>
      ))}
    </ul>
  );
}

export function TaskDetailSubtasksPanel({
  items,
  onAddSubtask,
  issueLinkState,
}: {
  items: Issue[];
  onAddSubtask?: () => void;
  issueLinkState?: unknown;
}) {
  const completed = items.filter((item) => item.status === "done").length;
  const progress = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;
  const { nextAction, rootBlocker, remainingItems } = resolveTaskDetailSubtaskState(items);
  const allCompleted = items.length > 0 && completed === items.length;

  return (
    <section className="flex flex-col gap-4" aria-label={tNewUi("newUi.k7eff0a1919b2")}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{tNewUi("newUi.k4664827f8e89")}</span>
          <span className="font-mono">{completed} {tNewUi("newUi.k28391d3bc64e")} {items.length} {tNewUi("newUi.keebbf6457e46")}</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={tNewUi("newUi.k7e7ba512c0d1")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className="h-full rounded-full bg-(--status-task-icon-done) transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {rootBlocker ? (
        <section className="flex flex-col gap-1.5" aria-labelledby="task-root-blocker-heading">
          <h3 id="task-root-blocker-heading" className="text-xs font-medium text-muted-foreground">
            {tNewUi("newUi.k9c1c8ef57c04")}
          </h3>
          <RelationNavigationList
            items={[rootBlocker]}
            emptyMessage=""
            ariaLabel={tNewUi("newUi.k9c1c8ef57c04")}
            issueLinkState={issueLinkState}
          />
        </section>
      ) : null}

      {nextAction ? (
        <section className="flex flex-col gap-1.5" aria-labelledby="task-next-action-heading">
          <h3 id="task-next-action-heading" className="text-xs font-medium text-muted-foreground">
            {nextAction.status === "blocked" ? tNewUi("newUi.k6e5a137d82e4") : tNewUi("newUi.k365987d015f7")}
          </h3>
          <TaskDetailTaskList
            items={[nextAction]}
            ariaLabel={tNewUi("newUi.k2da7268bc83b")}
            issueLinkState={issueLinkState}
          />
        </section>
      ) : items.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {allCompleted ? tNewUi("newUi.ka49f51a55699") : tNewUi("newUi.ke87f15bb8867")}
        </p>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">{tNewUi("newUi.k17d17d5bca7d")}</p>
      )}

      {remainingItems.length > 0 ? (
        <section className="flex flex-col gap-1.5" aria-labelledby="task-other-subtasks-heading">
          <h3 id="task-other-subtasks-heading" className="text-xs font-medium text-muted-foreground">
            {nextAction ? tNewUi("newUi.k087ef0686932") : tNewUi("newUi.k7eff0a1919b2")}
          </h3>
          <TaskDetailTaskList
            items={remainingItems}
            ariaLabel={nextAction ? tNewUi("newUi.k087ef0686932") : tNewUi("newUi.k7eff0a1919b2")}
            issueLinkState={issueLinkState}
          />
        </section>
      ) : null}

      {onAddSubtask ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAddSubtask}>
          <Plus className="h-3.5 w-3.5" />
          {tNewUi("newUi.k65db0c29ba4f")}
        </Button>
      ) : null}
    </section>
  );
}

export function TaskDetailReferencesPanel({
  referenced,
  mentionedIn,
  issueLinkState,
}: {
  referenced: TaskDetailRelationItem[];
  mentionedIn: TaskDetailRelationItem[];
  issueLinkState?: unknown;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-labelledby="task-referenced-heading">
        <h3 id="task-referenced-heading" className="text-xs font-medium text-muted-foreground">
          {tNewUi("newUi.ke1ea8a5e413c")}
        </h3>
        <RelationNavigationList
          items={referenced}
          emptyMessage={tNewUi("newUi.k9547804c7036")}
          ariaLabel={tNewUi("newUi.k2b2c775c51bd")}
          issueLinkState={issueLinkState}
        />
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="task-mentioned-in-heading">
        <h3 id="task-mentioned-in-heading" className="text-xs font-medium text-muted-foreground">
          {tNewUi("newUi.kfb9d60f69a60")}
        </h3>
        <RelationNavigationList
          items={mentionedIn}
          emptyMessage={tNewUi("newUi.k5ddc410be7b3")}
          ariaLabel={tNewUi("newUi.k1780231a0656")}
          issueLinkState={issueLinkState}
        />
      </section>
    </div>
  );
}
