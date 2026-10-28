import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, MoreHorizontal, Pencil, RefreshCw } from "lucide-react";
import { agentsApi } from "@/api/agents";
import { issuesApi } from "@/api/issues";
import { queryKeys } from "@/lib/queryKeys";
import { useRecentTasks } from "@/hooks/useRecentTasks";
import { useAccountIdentity } from "@/api/companies-query";
import { useSidebar } from "@/context/SidebarContext";
import { useOptionalToastActions } from "@/context/ToastContext";
import {
  updateRecentTaskSnapshots,
  type RecentTaskEntry,
} from "@/lib/recent-tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";

const RECENT_TASK_MENU_ITEM_CLASS =
  "h-(--profile-popover-row-height) gap-(--profile-popover-row-gap) rounded-lg px-2.5 py-0 text-(length:--text-compact) font-medium leading-(--profile-popover-label-line-height) focus:bg-accent/50 focus:text-foreground";
const RESTART_WAKE_RETRY_STORAGE_SUFFIX = ":restart-wake-retry";

function restartWakeRetryStorageKey(companyId: string, userId: string | null) {
  // Action retry state must survive changes to the recent-task snapshot format.
  return `paperclip.recentTasks:${companyId}:${userId ?? "__local_board__"}${RESTART_WAKE_RETRY_STORAGE_SUFFIX}`;
}

function readRestartWakeRetryIssueIds(storageKey: string | null) {
  if (!storageKey) return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function setRestartWakeRetryPending(storageKey: string | null, issueId: string, pending: boolean) {
  if (!storageKey) return;
  const issueIds = readRestartWakeRetryIssueIds(storageKey);
  if (pending) issueIds.add(issueId);
  else issueIds.delete(issueId);
  try {
    if (issueIds.size > 0) window.localStorage.setItem(storageKey, JSON.stringify([...issueIds]));
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Recent Tasks remains usable when browser storage is unavailable.
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function SidebarRecentTasks({
  companyId,
  liveIssueIds,
}: {
  companyId: string | null | undefined;
  liveIssueIds: ReadonlySet<string>;
}) {
  const { collapsed, peeking } = useSidebar();
  const rail = collapsed && !peeking;
  const { userId, settled } = useAccountIdentity();

  if (!companyId || !settled) return null;

  return (
    <RecentTasksList
      key={`${companyId}:${userId ?? "__local_board__"}`}
      companyId={companyId}
      userId={userId}
      liveIssueIds={liveIssueIds}
      rail={rail}
    />
  );
}

function RecentTasksList({
  companyId,
  userId,
  liveIssueIds,
  rail,
}: {
  companyId: string;
  userId: string | null;
  liveIssueIds: ReadonlySet<string>;
  rail: boolean;
}) {
  const { entries, storageKey } = useRecentTasks({ companyId, userId });
  const queryClient = useQueryClient();
  const toastActions = useOptionalToastActions();
  const [renameEntry, setRenameEntry] = useState<RecentTaskEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingAction, setPendingAction] = useState<"rename" | "archive" | "pause" | null>(null);
  const restartRetryStorageKey = restartWakeRetryStorageKey(companyId, userId);

  if (entries.length === 0) return null;

  const refreshIssueQueries = async (issueId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId) }),
    ]);
  };

  const beginRename = (entry: RecentTaskEntry) => {
    setRenameEntry(entry);
    setRenameValue(entry.title);
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = renameValue.trim();
    if (!renameEntry || !nextTitle || nextTitle === renameEntry.title) {
      setRenameEntry(null);
      return;
    }

    setPendingAction("rename");
    try {
      const updated = await issuesApi.update(renameEntry.id, { title: nextTitle });
      queryClient.setQueryData(queryKeys.issues.detail(renameEntry.id), updated);
      if (storageKey) updateRecentTaskSnapshots(storageKey, companyId, [updated]);
      await refreshIssueQueries(renameEntry.id);
      setRenameEntry(null);
      toastActions?.pushToast({ title: tNewUi("newUi.k136fd9d2741b"), tone: "success" });
    } catch (error) {
      toastActions?.pushToast({
        title: tNewUi("newUi.kd5ce4a7f4b5c"),
        body: errorMessage(error, tNewUi("newUi.k4036341161f5")),
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const archiveTask = async (entry: RecentTaskEntry) => {
    setPendingAction("archive");
    try {
      await issuesApi.archiveFromInbox(entry.id);
      await refreshIssueQueries(entry.id);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(companyId),
      });
      toastActions?.pushToast({ title: tNewUi("newUi.kca9374d16da7"), tone: "success" });
    } catch (error) {
      toastActions?.pushToast({
        title: tNewUi("newUi.kc44e1abcfdea"),
        body: errorMessage(error, tNewUi("newUi.kd87400fef421")),
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const toggleTaskPause = async (entry: RecentTaskEntry) => {
    setPendingAction("pause");
    try {
      const state = await issuesApi.getTreeControlState(entry.id);
      if (state.activePauseHold?.isRoot) {
        const restartIssue = await issuesApi.get(entry.id);
        setRestartWakeRetryPending(restartRetryStorageKey, entry.id, true);
        await issuesApi.releaseTreeHold(entry.id, state.activePauseHold.holdId, {
          reason: "Restarted from Recent Tasks.",
        });
        if (restartIssue.assigneeAgentId) {
          const wakeResult = await agentsApi.wakeup(
            restartIssue.assigneeAgentId,
            {
              source: "assignment",
              triggerDetail: "manual",
              reason: "recent_task_restart",
              payload: { issueId: restartIssue.id },
            },
            restartIssue.companyId,
          );
          if (!("id" in wakeResult)) {
            throw new Error(wakeResult.message ?? tNewUi("newUi.k6722b0daa761"));
          }
        }
        setRestartWakeRetryPending(restartRetryStorageKey, entry.id, false);
        toastActions?.pushToast({ title: tNewUi("newUi.k2769f7fb2000"), tone: "success" });
      } else if (state.activePauseHold) {
        throw new Error(tNewUi("newUi.kf78654d3044b"));
      } else if (readRestartWakeRetryIssueIds(restartRetryStorageKey).has(entry.id)) {
        const restartIssue = await issuesApi.get(entry.id);
        if (restartIssue.assigneeAgentId) {
          const wakeResult = await agentsApi.wakeup(
            restartIssue.assigneeAgentId,
            {
              source: "assignment",
              triggerDetail: "manual",
              reason: "recent_task_restart_retry",
              payload: { issueId: restartIssue.id },
            },
            restartIssue.companyId,
          );
          if (!("id" in wakeResult)) {
            throw new Error(wakeResult.message ?? tNewUi("newUi.k6722b0daa761"));
          }
        }
        setRestartWakeRetryPending(restartRetryStorageKey, entry.id, false);
        toastActions?.pushToast({ title: tNewUi("newUi.k2769f7fb2000"), tone: "success" });
      } else {
        await issuesApi.createTreeHold(entry.id, {
          mode: "pause",
          reason: "Paused from Recent Tasks.",
          releasePolicy: { strategy: "manual" },
        });
        toastActions?.pushToast({ title: tNewUi("newUi.kd75247d08736"), tone: "success" });
      }
      await queryClient.invalidateQueries({
        queryKey: ["issues", "tree-control-state", entry.id],
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.issues.summaries(companyId) });
    } catch (error) {
      toastActions?.pushToast({
        title: tNewUi("newUi.k9b384ff0ca06"),
        body: errorMessage(error, tNewUi("newUi.k40ed9c8d58a0")),
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <>
      <SidebarSection label={t("overview.dashboard.recentTasks")}>
        {entries.map((entry) => (
          <div key={entry.id} className="sidebar-action-row group/recent-task relative">
            <SidebarNavItem
              to={`/issues/${entry.id}`}
              label={entry.title}
              trailing={entry.status === "in_review" && entry.externalConversationState === "waiting"
                ? <span className="text-xs text-muted-foreground">{t("issueWork.idle")}</span> : undefined}
              trailingLabel={entry.status === "in_review" && entry.externalConversationState === "waiting" ? tNewUi("newUi.kab0171ca0494") : undefined}
              className={rail ? undefined : "sidebar-action-link pointer-coarse:pr-8"}
              liveCount={liveIssueIds.has(entry.id) ? 1 : undefined}
            />
            {!rail ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`More actions for ${entry.title}`}
                    className="sidebar-action-menu absolute right-2 top-(--pct-50) z-10 -translate-y-(--pct-50) text-muted-foreground pointer-events-none opacity-0 transition-opacity hover:bg-sidebar-accent dark:hover:bg-sidebar-accent hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 pointer-coarse:before:hidden group-hover/recent-task:pointer-events-auto group-hover/recent-task:opacity-100 group-focus-within/recent-task:pointer-events-auto group-focus-within/recent-task:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:bg-sidebar-accent data-[state=open]:text-foreground data-[state=open]:opacity-100"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="start"
                  className="w-(--profile-popover-width) rounded-xl p-1.5 shadow-(--shadow-profile-popover)"
                >
                  <DropdownMenuItem
                    className={RECENT_TASK_MENU_ITEM_CLASS}
                    onSelect={() => beginRename(entry)}
                  >
                    <Pencil aria-hidden="true" />
                    {t("skills.phrases.Rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={RECENT_TASK_MENU_ITEM_CLASS}
                    disabled={pendingAction !== null}
                    onSelect={() => void archiveTask(entry)}
                  >
                    <Archive aria-hidden="true" />
                    {tNewUi("newUi.k66f4804ee23d")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={RECENT_TASK_MENU_ITEM_CLASS}
                    disabled={pendingAction !== null}
                    onSelect={() => void toggleTaskPause(entry)}
                  >
                    <RefreshCw aria-hidden="true" />
                    {tNewUi("newUi.k7d81fbdd2e93")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ))}
      </SidebarSection>

      <Dialog
        open={renameEntry !== null}
        onOpenChange={(open) => {
          if (!open && pendingAction !== "rename") setRenameEntry(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={(event) => void submitRename(event)}>
            <DialogHeader>
              <DialogTitle>{tNewUi("newUi.k5b1f3e19f6cd")}</DialogTitle>
              <DialogDescription>{tNewUi("newUi.ke35c8b971c35")}</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              aria-label={tNewUi("newUi.kd5164108945c")}
              value={renameValue}
              disabled={pendingAction === "rename"}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={pendingAction === "rename"}
                onClick={() => setRenameEntry(null)}
              >
                {t("taskDetail.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={pendingAction === "rename" || !renameValue.trim()}
              >
                {pendingAction === "rename" ? "Saving..." : tNewUi("newUi.k1509f561f241")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
