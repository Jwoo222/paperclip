import { useMemo, type CSSProperties } from "react";
import { Folder, GitBranch, GitBranchPlus, Monitor } from "lucide-react";
import type { ExecutionWorkspaceSummary } from "@paperclipai/shared";
import { SearchableSelect, type SearchableSelectOption } from "@/components/SearchableSelect";
import { orderReusableExecutionWorkspaces } from "@/lib/reusable-execution-workspaces";
import { t } from "@/i18n";

interface WorktreeOption extends SearchableSelectOption {
  mode: string;
  workspaceId?: string;
  description: string;
}

interface ComposerWorktreePickerProps {
  mode: string;
  workspaceId: string;
  workspaces: readonly ExecutionWorkspaceSummary[];
  onChange: (mode: string, workspaceId: string) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  disabled?: boolean;
  mobile?: boolean;
  contentStyle?: CSSProperties;
  selectedWorkspaceLabel?: string;
}

function modeOptions(): WorktreeOption[] {
  return [
    { key: "isolated_workspace", value: "isolated_workspace", mode: "isolated_workspace", label: t("upgrade1029NewComponents.composerWorktreePicker.newWorktree"), description: t("upgrade1029NewComponents.composerWorktreePicker.newWorktreeDescription") },
    { key: "shared_workspace", value: "shared_workspace", mode: "shared_workspace", label: t("pipelinesExtra.settings.projectWorkspace"), description: t("upgrade1029NewComponents.composerWorktreePicker.projectWorkspaceDescription") },
    { key: "operator_branch", value: "operator_branch", mode: "operator_branch", label: t("upgrade1029NewComponents.composerWorktreePicker.newBranch"), description: t("upgrade1029NewComponents.composerWorktreePicker.newBranchDescription") },
    { key: "agent_default", value: "agent_default", mode: "agent_default", label: t("upgrade2610Task.agentDefault"), description: t("upgrade1029NewComponents.composerWorktreePicker.agentDefaultDescription") },
    { key: "inherit", value: "inherit", mode: "inherit", label: t("taskDetailExtra.projectDefault"), description: t("upgrade1029NewComponents.composerWorktreePicker.projectDefaultDescription") },
  ];
}

/** Reuses the searchable selector and the existing workspace recency ordering. */
export function ComposerWorktreePicker({
  mode, workspaceId, workspaces, onChange, loading, error, onRetry,
  disabled, mobile, contentStyle, selectedWorkspaceLabel,
}: ComposerWorktreePickerProps) {
  const groups = useMemo(() => {
    const MODE_OPTIONS = modeOptions();
    return [
    { id: "new", options: [MODE_OPTIONS[0]!] },
    {
      id: "reuse", label: t("upgrade1029NewComponents.composerWorktreePicker.reuseWorktree"),
      options: orderReusableExecutionWorkspaces(workspaces).map((workspace): WorktreeOption => ({
        key: `reuse:${workspace.id}`, value: `reuse:${workspace.id}`,
        workspaceId: workspace.id, mode: "reuse_existing", label: workspace.name,
        description: workspace.branchName ?? t("upgrade1029NewComponents.composerWorktreePicker.existingWorkspace"),
        searchText: `${workspace.branchName ?? ""} ${workspace.id}`,
      })),
    },
    {
      id: "other", label: t("upgrade1029NewComponents.composerWorktreePicker.otherOptions"),
      options: MODE_OPTIONS.filter((option) => option.mode === "shared_workspace"
        || (option.mode !== "isolated_workspace" && option.mode === mode)),
    },
    ];
  }, [mode, workspaces]);

  const value = mode === "reuse_existing" ? `reuse:${workspaceId}` : mode;
  return (
    <SearchableSelect<string, WorktreeOption>
      value={value}
      groups={groups}
      onValueChange={(_, option) => onChange(option.mode, option.workspaceId ?? "")}
      placeholder={t("upgrade1029NewComponents.composerWorktreePicker.worktrees")}
      triggerAriaLabel={t("upgrade1029NewComponents.composerWorktreePicker.worktrees")}
      mobileTitle={t("upgrade1029NewComponents.composerWorktreePicker.worktrees")}
      searchPlaceholder={t("upgrade1029NewComponents.composerWorktreePicker.searchWorktrees")}
      emptyMessage={t("upgrade1029NewComponents.composerWorktreePicker.noMatching")}
      disabled={disabled}
      modal={mobile}
      contentStyle={contentStyle}
      contentWidth="auto"
      className="min-w-0 flex-1 sm:flex-none sm:max-w-72"
      triggerClassName="h-8 gap-1.5 border-0 bg-transparent px-2 text-xs font-medium shadow-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-0"
      renderValue={(option) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <GitBranch className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            <span className="hidden text-muted-foreground sm:inline">{t("upgrade1029NewComponents.composerWorktreePicker.worktrees")} · </span>
            {option?.label ?? selectedWorkspaceLabel ?? t("upgrade1029NewComponents.composerWorktreePicker.selectWorktree")}
          </span>
        </span>
      )}
      renderOption={(option) => {
        const Icon = option.workspaceId ? GitBranch : option.mode === "isolated_workspace" ? GitBranchPlus
          : option.mode === "agent_default" ? Monitor : option.mode === "operator_branch" ? GitBranch : Folder;
        return (
          <>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{option.label}</span>
              <span className="truncate text-xs text-muted-foreground">{option.description}</span>
            </span>
          </>
        );
      }}
      listFooter={loading || error || workspaces.length === 0 ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground" role="status">
          {loading ? t("upgrade1029NewComponents.composerWorktreePicker.loadingExisting") : error ? (
            <span className="flex items-center justify-between gap-2">
              {t("upgrade1029NewComponents.composerWorktreePicker.loadFailed")}
              <button type="button" className="rounded px-2 py-1 text-foreground hover:bg-accent" onClick={onRetry}>{t("adapterImportVault.retry")}</button>
            </span>
          ) : t("upgrade1029NewComponents.composerWorktreePicker.noExisting")}
        </div>
      ) : undefined}
    />
  );
}
