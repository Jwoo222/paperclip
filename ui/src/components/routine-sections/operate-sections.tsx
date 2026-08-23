import { useMemo, useState } from "react";
import { Activity as ActivityIcon, Play, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { timeAgo } from "../../lib/timeAgo";
import { runRowSubtitle, dedupedTriggerLabel } from "../../lib/routine-run-display";
import { EmptyState } from "../EmptyState";
import { EntityRow } from "../EntityRow";
import { FilterBar, type FilterValue } from "../FilterBar";
import { LiveRunWidget } from "../LiveRunWidget";
import { RoutineHistoryTab } from "../RoutineHistoryTab";
import { RoutineActivityRow } from "../RoutineActivityRow";
import { useRoutineDetail } from "./context";
import { useTranslation } from "@/i18n";

const DATE_WINDOW_OPTIONS: { value: string; ms: number | null }[] = [
  { value: "any", ms: null },
  { value: "24h", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
];

export function RunsSection() {
  const { t } = useTranslation();
  const ctx = useRoutineDetail();
  const { routine, routineRuns, hasLiveRun, activeIssueId, onOpenRunDialog } = ctx;
  const runs = useMemo(() => routineRuns ?? [], [routineRuns]);

  const [sourceFilter, setSourceFilter] = useState("any");
  const [statusFilter, setStatusFilter] = useState("any");
  const [dateFilter, setDateFilter] = useState("any");
  const statusLabel = (status: string) =>
    t(`statusResidualRound3.status.${status}`, { defaultValue: status.replaceAll("_", " ") });
  const sourceLabel = (source: string) =>
    t(`statusResidualRound3.source.${source}`, { defaultValue: source.replaceAll("_", " ") });
  const dateWindowOptions = DATE_WINDOW_OPTIONS.map((option) => ({
    ...option,
    label: option.value === "any"
      ? t("operations.routines.anyTime")
      : option.value === "24h"
        ? t("operations.routines.last24h")
        : option.value === "7d"
          ? t("operations.routines.last7d")
          : t("operations.routines.last30d"),
  }));

  const sourceOptions = useMemo(
    () => [...new Set(runs.map((run) => run.source))].sort(),
    [runs],
  );
  const statusOptions = useMemo(
    () => [...new Set(runs.map((run) => run.status))].sort(),
    [runs],
  );

  const filtered = useMemo(() => {
    const windowMs = dateWindowOptions.find((option) => option.value === dateFilter)?.ms ?? null;
    const cutoff = windowMs == null ? null : Date.now() - windowMs;
    return runs.filter((run) => {
      if (sourceFilter !== "any" && run.source !== sourceFilter) return false;
      if (statusFilter !== "any" && run.status !== statusFilter) return false;
      if (cutoff != null && new Date(run.triggeredAt).getTime() < cutoff) return false;
      return true;
    });
  }, [runs, sourceFilter, statusFilter, dateFilter, dateWindowOptions]);

  const activeFilters: FilterValue[] = [];
  if (sourceFilter !== "any") {
    activeFilters.push({ key: "source", label: t("operations.routines.source"), value: sourceLabel(sourceFilter) });
  }
  if (statusFilter !== "any") {
    activeFilters.push({ key: "status", label: t("operations.common.status"), value: statusLabel(statusFilter) });
  }
  if (dateFilter !== "any") {
    const label = dateWindowOptions.find((option) => option.value === dateFilter)?.label ?? dateFilter;
    activeFilters.push({ key: "date", label: t("routineDetailExtra.runs.date"), value: label });
  }

  function clearFilters() {
    setSourceFilter("any");
    setStatusFilter("any");
    setDateFilter("any");
  }

  function removeFilter(key: string) {
    if (key === "source") setSourceFilter("any");
    if (key === "status") setStatusFilter("any");
    if (key === "date") setDateFilter("any");
  }

  return (
    <div className="space-y-4">
      {hasLiveRun && activeIssueId ? (
        <LiveRunWidget issueId={activeIssueId} companyId={routine.companyId} />
      ) : null}

      {runs.length === 0 ? (
        <EmptyState
          icon={Play}
          message={t("operations.routines.noRuns")}
          action={t("operations.routines.runNow")}
          onAction={onOpenRunDialog}
        />
      ) : (
        <>
          {/* Filter chips row (§3.6) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs" aria-label={t("operations.routines.filterSource")}>
                  <span className="text-muted-foreground">{t("operations.routines.source")}:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("statusResidualRound3.common.all")}</SelectItem>
                  {sourceOptions.map((source) => (
                    <SelectItem key={source} value={source}>
                      {sourceLabel(source)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs" aria-label={t("operations.routines.filterStatus")}>
                  <span className="text-muted-foreground">{t("operations.common.status")}:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t("statusResidualRound3.common.all")}</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger size="sm" className="h-8 w-auto gap-1.5 text-xs" aria-label={t("routineDetailExtra.runs.filterDate")}>
                  <span className="text-muted-foreground">{t("routineDetailExtra.runs.date")}:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateWindowOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FilterBar filters={activeFilters} onRemove={removeFilter} onClear={clearFilters} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              message={t("routineDetailExtra.runs.noMatch")}
              action={t("routineDetailExtra.runs.clearFilters")}
              onAction={clearFilters}
            />
          ) : (
            <div className="rounded-lg border border-border">
              {filtered.map((run) => {
                const label = dedupedTriggerLabel(run.trigger);
                const title = run.linkedIssue?.title ?? label ?? t("statusResidualRound3.common.run");
                return (
                  <EntityRow
                    key={run.id}
                    leading={
                      <>
                        <Badge variant="outline" className="shrink-0">
                          {sourceLabel(run.source)}
                        </Badge>
                        <Badge
                          variant={run.status === "failed" ? "destructive" : "secondary"}
                          className="shrink-0"
                        >
                          {statusLabel(run.status)}
                        </Badge>
                      </>
                    }
                    identifier={
                      run.linkedIssue
                        ? run.linkedIssue.identifier ?? run.linkedIssue.id.slice(0, 8)
                        : undefined
                    }
                    title={title}
                    subtitle={runRowSubtitle(run, routine.variables)}
                    reserveSubtitleSpace
                    trailing={
                      <span className="text-xs text-muted-foreground">{timeAgo(run.triggeredAt)}</span>
                    }
                    to={
                      run.linkedIssue
                        ? `/issues/${run.linkedIssue.identifier ?? run.linkedIssue.id}`
                        : undefined
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ActivitySection() {
  const { t, i18n } = useTranslation();
  const ctx = useRoutineDetail();
  const { activity } = ctx;
  const events = activity ?? [];
  const locale = i18n.resolvedLanguage ?? i18n.language;

  const groups = useMemo(() => {
    const byDay = new Map<string, typeof events>();
    for (const event of events) {
      let label = t("statusResidualRound3.common.earlier");
      try {
        label = new Date(event.createdAt).toLocaleDateString(locale, {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      } catch {
        /* keep fallback label */
      }
      const bucket = byDay.get(label) ?? [];
      bucket.push(event);
      byDay.set(label, bucket);
    }
    return Array.from(byDay.entries());
  }, [events, locale, t]);

  if (events.length === 0) {
    return <EmptyState icon={ActivityIcon} message={t("routineDetailExtra.activity.empty")} />;
  }

  return (
    <div className="space-y-4">
      {groups.map(([day, dayEvents]) => (
        <div key={day}>
          <div className="sticky top-0 bg-background py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {day}
          </div>
          <div>
            {dayEvents.map((event) => (
              <RoutineActivityRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistorySection() {
  const ctx = useRoutineDetail();
  const {
    routine,
    isEditDirty,
    dirtyFields,
    routineDefaults,
    setEditDraft,
    saveRoutine,
    agentById,
    projectById,
    availableSecrets,
    onHistoryRestoreSecretMaterials,
    onHistoryRestored,
  } = ctx;

  return (
    <RoutineHistoryTab
      routine={routine}
      isEditDirty={isEditDirty}
      dirtyFields={dirtyFields}
      onDiscardEdits={() => setEditDraft(routineDefaults)}
      onSaveEdits={() => {
        if (!saveRoutine.isPending && routine.title.trim()) {
          saveRoutine.mutate();
        }
      }}
      agents={agentById}
      projects={projectById}
      secrets={availableSecrets}
      onRestoreSecretMaterials={onHistoryRestoreSecretMaterials}
      onRestored={onHistoryRestored}
    />
  );
}
