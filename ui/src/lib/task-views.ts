import { t } from "@/i18n";
import type { InboxTab } from "./inbox";

/**
 * The single view registry behind the merged Tasks surface (PAP-670).
 *
 * Inbox stopped being its own nav row and its five tabs became views inside
 * Tasks, alongside the status presets that used to live only inside the task
 * list's filter popover. Every view is addressed as `/issues?view=<key>`.
 *
 * Each view declares which surface renders it:
 *   - `inbox`  — the attention-ordered inbox list (unread state, archive,
 *                date groups, mixed approval/failed-run/join-request rows).
 *   - `issues` — the task collection list (board/list modes, filters, columns).
 *
 * Views are *not* reimplemented on the other surface: pointing a view at the
 * component that already owns those behaviours is what keeps them intact.
 */
export const TASK_VIEW_KEYS = [
  "mine",
  "unread",
  "blocked",
  "recent",
  "everything",
  "all",
  "active",
  "backlog",
  "done",
] as const;

export type TaskViewKey = (typeof TASK_VIEW_KEYS)[number];
export type TaskViewSurface = "inbox" | "issues";

export interface TaskView {
  key: TaskViewKey;
  label: string;
  surface: TaskViewSurface;
  /** Which inbox tab renders this view (`inbox` surface only). */
  inboxTab?: InboxTab;
  /** Status filter applied on entry (`issues` surface only). */
  statuses?: string[];
  /** One-line description shown in the Views menu. */
  hint: string;
}

export interface TaskViewGroup {
  label: string;
  views: TaskView[];
}

// Labels and hints are getters so they follow a runtime language switch
// instead of freezing at module load.
export const TASK_VIEW_GROUPS: TaskViewGroup[] = [
  {
    get label() { return t("upgrade2610Shell.myWork"); },
    views: [
      { key: "mine", get label() { return t("coreNavigation.inbox.mine"); }, surface: "inbox", inboxTab: "mine", get hint() { return t("upgrade2610Shell.taskViews.mineHint"); } },
      { key: "unread", get label() { return t("coreNavigation.inbox.unread"); }, surface: "inbox", inboxTab: "unread", get hint() { return t("upgrade2610Shell.taskViews.unreadHint"); } },
      { key: "blocked", get label() { return t("coreNavigation.inbox.blocked"); }, surface: "inbox", inboxTab: "blocked", get hint() { return t("upgrade2610Shell.taskViews.blockedHint"); } },
      { key: "recent", get label() { return t("coreNavigation.inbox.recent"); }, surface: "inbox", inboxTab: "recent", get hint() { return t("upgrade2610Shell.taskViews.recentHint"); } },
      { key: "everything", get label() { return t("upgrade2610Shell.taskViews.everything"); }, surface: "inbox", inboxTab: "all", get hint() { return t("upgrade2610Shell.taskViews.everythingHint"); } },
    ],
  },
  {
    get label() { return t("shell.organization"); },
    views: [
      { key: "all", get label() { return t("upgrade2610Shell.taskViews.allTasks"); }, surface: "issues", statuses: [], get hint() { return t("upgrade2610Shell.taskViews.allTasksHint"); } },
      { key: "active", get label() { return t("upgrade2610Shell.taskViews.active"); }, surface: "issues", statuses: ["todo", "in_progress", "in_review", "blocked"], get hint() { return t("upgrade2610Shell.taskViews.activeHint"); } },
      { key: "backlog", get label() { return t("searchStatus.status.backlog"); }, surface: "issues", statuses: ["backlog"], get hint() { return t("upgrade2610Shell.taskViews.backlogHint"); } },
      { key: "done", get label() { return t("searchStatus.status.done"); }, surface: "issues", statuses: ["done", "cancelled"], get hint() { return t("upgrade2610Shell.taskViews.doneHint"); } },
    ],
  },
];

const VIEWS_BY_KEY = new Map<TaskViewKey, TaskView>(
  TASK_VIEW_GROUPS.flatMap((group) => group.views.map((view) => [view.key, view] as const)),
);

export const DEFAULT_TASK_VIEW: TaskViewKey = "mine";
export const TASK_VIEW_PARAM = "view";
export const TASK_LAST_VIEW_KEY = "paperclip:tasks:last-view";

export function isTaskViewKey(value: unknown): value is TaskViewKey {
  return typeof value === "string" && VIEWS_BY_KEY.has(value as TaskViewKey);
}

export function taskView(key: TaskViewKey): TaskView {
  return VIEWS_BY_KEY.get(key)!;
}

/** Resolves a `?view=` value, falling back to `null` so callers can pick a default. */
export function normalizeTaskViewKey(value: string | null | undefined): TaskViewKey | null {
  return isTaskViewKey(value) ? value : null;
}

export function taskViewPath(key: TaskViewKey): string {
  return `/issues?${TASK_VIEW_PARAM}=${key}`;
}

/** Inbox tab → view key, for redirecting the retired `/inbox/*` URLs. */
const VIEW_BY_INBOX_TAB: Record<InboxTab, TaskViewKey> = {
  mine: "mine",
  unread: "unread",
  blocked: "blocked",
  recent: "recent",
  all: "everything",
};

export function taskViewForInboxTab(tab: string | null | undefined): TaskViewKey {
  return (tab && tab in VIEW_BY_INBOX_TAB)
    ? VIEW_BY_INBOX_TAB[tab as InboxTab]
    : DEFAULT_TASK_VIEW;
}

export function loadLastTaskView(): TaskViewKey {
  try {
    return normalizeTaskViewKey(window.localStorage.getItem(TASK_LAST_VIEW_KEY)) ?? DEFAULT_TASK_VIEW;
  } catch {
    return DEFAULT_TASK_VIEW;
  }
}

export function saveLastTaskView(key: TaskViewKey): void {
  try {
    window.localStorage.setItem(TASK_LAST_VIEW_KEY, key);
  } catch {
    /* Navigation still works without storage; the default view just returns. */
  }
}

/**
 * Query params that only the organization task list understands. A deep link
 * carrying one of these (the dashboard's "assigned to me", a workspace
 * drill-in, a search hand-off) must not land on a My-work view, so it resolves
 * to `All tasks` instead of the user's last-used view.
 */
export const ORGANIZATION_SCOPED_PARAMS = [
  "assignee",
  "workspace",
  "participantAgentId",
  "q",
] as const;

/** Resolves which view a `/issues` visit opens. */
export function resolveInitialTaskView(
  requested: string | null,
  hasOrganizationScopedParam: boolean,
  lastUsed: TaskViewKey,
): TaskViewKey {
  const explicit = normalizeTaskViewKey(requested);
  // Inbox views can't apply organization filters, so a link carrying one
  // opens All tasks rather than silently dropping the filter.
  if (hasOrganizationScopedParam && (!explicit || taskView(explicit).surface === "inbox")) return "all";
  return explicit ?? lastUsed;
}
