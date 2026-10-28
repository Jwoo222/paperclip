import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PauseCircle, PlayCircle, Repeat, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

/** Shared by the task header and its Storybook composition. */
export function TaskTreeControlMenuItems({
  scope,
  canPause,
  canResume,
  canCancel,
  canRestore,
  pending,
  onPause,
  onResume,
  onCancel,
  onRestore,
}: {
  scope: "leaf" | "subtree";
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  canRestore: boolean;
  pending?: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRestore: () => void;
}) {
  const itemClass =
    "flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent/50 disabled:opacity-50 disabled:pointer-events-none";
  return (
    <>
      {canPause ? (
        <button disabled={pending} className={itemClass} onClick={onPause}>
          <PauseCircle className="h-3 w-3" />
          {scope === "leaf" ? tNewUi("newUi.k0faaea9a215f") : tNewUi("newUi.kd44920538f70")}
        </button>
      ) : null}
      {canResume ? (
        <button disabled={pending} className={itemClass} onClick={onResume}>
          <PlayCircle className="h-3 w-3" />
          {scope === "leaf" ? tNewUi("newUi.k4c474b945549") : tNewUi("newUi.kb38209885d32")}
        </button>
      ) : null}
      {canCancel ? (
        <button
          disabled={pending}
          className={`${itemClass} text-destructive`}
          onClick={onCancel}
        >
          <XCircle className="h-3 w-3" />
          {tNewUi("newUi.kfccd5115640d")}
        </button>
      ) : null}
      {canRestore ? (
        <button disabled={pending} className={itemClass} onClick={onRestore}>
          <Repeat className="h-3 w-3" />
          {tNewUi("newUi.kb42c30447289")}
        </button>
      ) : null}
    </>
  );
}

export function TaskTreeControlDialog({
  open,
  onOpenChange,
  mode,
  scope,
  affectedCount,
  affectedAgentCount,
  warnings = [],
  loading,
  error,
  pending,
  valid,
  wakeAgents,
  onWakeAgentsChange,
  onRetry,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "resume" | "cancel" | "restore";
  scope: "leaf" | "subtree";
  affectedCount: number;
  affectedAgentCount: number;
  warnings?: string[];
  loading: boolean;
  error?: string | null;
  pending: boolean;
  valid: boolean;
  wakeAgents: boolean;
  onWakeAgentsChange: (wake: boolean) => void;
  onRetry: () => void;
  onApply: () => void;
}) {
  const cancel = mode === "cancel";
  const tasks = `${affectedCount} task${affectedCount === 1 ? "" : "s"}`;
  const title = cancel
    ? tNewUi("newUi.kb8b708d6da49")
    : mode === "restore"
      ? tNewUi("newUi.kd824b6aa69a9")
      : scope === "leaf"
        ? tNewUi("newUi.k4c474b945549")
        : tNewUi("newUi.kb38209885d32");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={!pending}
        className="max-h-(--sz-calc-18) overflow-y-auto sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading…"
              : cancel
                ? `${tasks} will be cancelled.`
                : mode === "restore"
                  ? tNewUi("upgrade1029AutoMerged.taskTreeControls.restoreDescription", { count: affectedCount })
                  : tNewUi("upgrade1029AutoMerged.taskTreeControls.resumeDescription", { count: affectedCount })}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={onRetry}
            >
              {t("issueDetailResidual.retryPreview")}
            </Button>
          </div>
        ) : null}
        {!cancel ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wakeAgents && affectedAgentCount > 0}
              disabled={pending || loading || affectedAgentCount === 0}
              onChange={(event) => onWakeAgentsChange(event.target.checked)}
            />
            {tNewUi("newUi.kba0ae69712da")}{affectedAgentCount})
          </label>
        ) : null}
        {!loading ? warnings.map((warning) => (
          <p key={warning} className="text-sm text-muted-foreground">{warning}</p>
        )) : null}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancel ? tNewUi("newUi.k8d7bd1de3300") : tNewUi("newUi.k7d9eb7acb13e")}
          </Button>
          <Button
            variant={cancel ? "destructive" : "default"}
            disabled={pending || loading || !!error || !valid}
            onClick={onApply}
          >
            {pending
              ? "Applying…"
              : cancel
                ? `Cancel ${tasks}`
                : mode === "restore"
                  ? `Restore ${tasks}`
                  : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quiet, persistent pause feedback shared by the task page and previews. */
export function TaskPauseNotice({
  scope,
  onResume,
  pending,
  className,
  resumeLink,
}: {
  scope: "leaf" | "subtree";
  onResume?: () => void;
  pending?: boolean;
  className?: string;
  resumeLink?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <span>
        {scope === "subtree" ? tNewUi("newUi.kf9ebf72d55c3") : tNewUi("newUi.kfb9c04c93b5e")}
      </span>
      {resumeLink ??
        (onResume ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onResume}
          >
            {scope === "subtree" ? tNewUi("newUi.kb38209885d32") : tNewUi("newUi.k4c474b945549")}
          </Button>
        ) : null)}
    </div>
  );
}
