import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, RotateCw, Server, Square } from "lucide-react";
import type {
  ToolConnection,
  ToolRuntimeAlertRecommendation,
  ToolRuntimeMetricSnapshot,
  ToolRuntimeSlot,
} from "@paperclipai/shared";
import { humanizeConnectionDisplayName, isToolConnectionAttentionHealth } from "@paperclipai/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { toolsApi } from "@/api/tools";
import { ApiError } from "@/api/client";
import { useToast } from "@/context/ToastContext";
import { EmptyState } from "@/components/EmptyState";
import { ToolsPageHeader, LoadingState, ErrorState, RelativeTime } from "./shared";
import { useTranslation } from "@/i18n";

/** Working / Needs attention / Off — the only status vocabulary on this surface. */
type RowStatus = "working" | "attention" | "off";

/**
 * A running-app row: a runtime slot joined to the connection it powers so we can
 * humanize its name and link to its `/apps/:connectionId` page. Status is derived
 * from the connection's health via `isToolConnectionAttentionHealth()` (with a
 * slot-health fallback) so the Apps index, app detail, and Health never disagree.
 */
interface RuntimeRow {
  slot: ToolRuntimeSlot;
  connection: ToolConnection | null;
  name: string;
  isLocal: boolean;
  status: RowStatus;
}

/** A health value that means the runtime slot itself is unhealthy. */
function slotHealthNeedsAttention(health: string | null | undefined): boolean {
  return health === "error" || health === "unhealthy" || health === "failed" || health === "degraded";
}

function rowStatusFor(slot: ToolRuntimeSlot, connection: ToolConnection | null): RowStatus {
  if (slot.status === "stopped" || slot.status === "disabled") return "off";
  if (connection && isToolConnectionAttentionHealth(connection.healthStatus)) return "attention";
  if (slot.status === "failed" || slot.status === "error") return "attention";
  if (slotHealthNeedsAttention(slot.healthStatus)) return "attention";
  return "working";
}

const STATUS_WORD: Record<RowStatus, string> = {
  working: "auditRuntime.runtime.statuses.working",
  attention: "auditRuntime.runtime.statuses.attention",
  off: "auditRuntime.runtime.statuses.off",
};

/** Filled dot (working) / triangle (needs attention) / hollow dot (off). */
function StatusMarker({ status }: { status: RowStatus }) {
  if (status === "attention") {
    return <span className="text-amber-600 dark:text-amber-400">▲</span>;
  }
  if (status === "off") {
    return <span className="inline-block h-2.5 w-2.5 rounded-full border border-muted-foreground/50" />;
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />;
}

function humanizeRowName(slot: ToolRuntimeSlot, connection: ToolConnection | null): string {
  if (connection) return humanizeConnectionDisplayName(connection);
  return humanizeConnectionDisplayName(slot.commandTemplateKey ?? slot.providerRef ?? slot.id.slice(0, 8));
}

/** Plain-words latency: "about 1.2s" / "about 240ms" / "—". */
function formatTypicalLatency(ms: number | null | undefined, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "—";
  if (ms >= 950) return t("auditRuntime.runtime.latency.aboutSeconds", { value: (ms / 1000).toFixed(1) });
  return t("auditRuntime.runtime.latency.aboutMilliseconds", { value: Math.round(ms) });
}

/** How the slot runs, in plain words. */
function howItRuns(slot: ToolRuntimeSlot, t: (key: string) => string): string {
  return t(slot.runtimeKind === "local_stdio" ? "auditRuntime.runtime.how.local" : "auditRuntime.runtime.how.remote");
}

/** Humanize the owner scope into a plain phrase. */
function scopeLabel(scope: string | null | undefined, t: (key: string) => string): string {
  switch (scope) {
    case "company":
      return t("auditRuntime.runtime.scopeLabels.company");
    case "project":
    case "project_workspace":
      return t("auditRuntime.runtime.scopeLabels.project");
    case "execution_workspace":
    case "issue":
      return t("auditRuntime.runtime.scopeLabels.task");
    case "agent":
      return t("auditRuntime.runtime.scopeLabels.agent");
    default:
      return scope ? scope.replace(/[_-]+/g, " ") : "—";
  }
}

/** Plain-words trust tier — quarantined local code reads as such; remote is provider-side. */
function trustTierLabel(slot: ToolRuntimeSlot, t: (key: string) => string): string {
  if (slot.runtimeKind !== "local_stdio") return t("auditRuntime.runtime.trust.provider");
  const quarantined =
    slot.status === "failed" ||
    slot.status === "error" ||
    slot.healthStatus === "error" ||
    slot.healthStatus === "unhealthy";
  return t(quarantined ? "auditRuntime.runtime.trust.quarantined" : "auditRuntime.runtime.trust.local");
}

/**
 * Plain-language translation for each supervisor alert. The runbook/severity
 * vocabulary stays out of these — it lives in the card's "Technical details".
 * `action` picks the one suggested button: restart the failing app, or a link to
 * the surface where the admin resolves it.
 */
type AlertAction = "restart" | "reviewApps" | "reviewActivity";
const ALERT_COPY: Record<string, { action: AlertAction }> = {
  mcp_runtime_stuck_starting_slot: {
    action: "restart",
  },
  mcp_runtime_stuck_running_slot: {
    action: "restart",
  },
  mcp_runtime_high_timeout_rate: {
    action: "reviewActivity",
  },
  mcp_runtime_high_error_rate: {
    action: "reviewActivity",
  },
  mcp_runtime_capacity_deferrals_repeated: {
    action: "reviewActivity",
  },
  mcp_runtime_restart_storm: {
    action: "restart",
  },
  mcp_runtime_connection_health_degraded: {
    action: "reviewApps",
  },
  mcp_runtime_missing_secret_failures: {
    action: "reviewApps",
  },
  mcp_runtime_audit_write_failures: {
    action: "reviewActivity",
  },
};

function plainAlertTitle(alert: ToolRuntimeAlertRecommendation, t: (key: string) => string): string {
  const map: Record<string, string> = {
    mcp_runtime_stuck_starting_slot: "stuckStarting", mcp_runtime_stuck_running_slot: "stoppedResponding", mcp_runtime_high_timeout_rate: "slow", mcp_runtime_high_error_rate: "errors", mcp_runtime_capacity_deferrals_repeated: "capacity", mcp_runtime_restart_storm: "restartStorm", mcp_runtime_connection_health_degraded: "reconnect", mcp_runtime_missing_secret_failures: "missingKey", mcp_runtime_audit_write_failures: "auditFailure",
  };
  const key = map[alert.name];
  return key ? t(`auditRuntime.runtime.alerts.${key}.title`) : alert.description;
}
function plainAlertBody(alert: ToolRuntimeAlertRecommendation, t: (key: string, options?: Record<string, unknown>) => string): string {
  const map: Record<string, string> = {
    mcp_runtime_stuck_starting_slot: "stuckStarting", mcp_runtime_stuck_running_slot: "stoppedResponding", mcp_runtime_high_timeout_rate: "slow", mcp_runtime_high_error_rate: "errors", mcp_runtime_capacity_deferrals_repeated: "capacity", mcp_runtime_restart_storm: "restartStorm", mcp_runtime_connection_health_degraded: "reconnect", mcp_runtime_missing_secret_failures: "missingKey", mcp_runtime_audit_write_failures: "auditFailure",
  };
  const key = map[alert.name];
  if (!key) return alert.observed;
  return t(`auditRuntime.runtime.alerts.${key}.body`, { observed: alert.observed.toLowerCase() });
}
function alertAction(alert: ToolRuntimeAlertRecommendation): AlertAction {
  return ALERT_COPY[alert.name]?.action ?? "reviewActivity";
}

interface ConfirmTarget {
  kind: "stop" | "restart";
  slotId: string;
  name: string;
}

/** One plain-number summary card with an optional ops-vocabulary tooltip. */
function SummaryCard({
  label,
  value,
  note,
  detail,
}: {
  label: string;
  value: string;
  note?: string;
  detail?: string;
}) {
  const labelEl = detail ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-muted-foreground/40 text-xs font-semibold text-muted-foreground">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{detail}</TooltipContent>
    </Tooltip>
  ) : (
    <span className="text-xs font-semibold text-muted-foreground">{label}</span>
  );
  return (
    <Card className="py-0">
      <CardContent className="space-y-1.5 px-5 py-4">
        <div>{labelEl}</div>
        <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{note ?? " "}</div>
      </CardContent>
    </Card>
  );
}

function LivePill() {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          {t("toolsResidualRound2.live")}
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("toolsResidualRound2.updatesEvery15Seconds")}</TooltipContent>
    </Tooltip>
  );
}

/** Card-level "Technical details" / row-level expander toggle. */
function Disclosure({ open, label }: { open: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      {label}
    </span>
  );
}

export function RuntimeTab({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [openAlertDetails, setOpenAlertDetails] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);

  const slots = useQuery({
    queryKey: queryKeys.tools.runtimeSlots(companyId),
    queryFn: () => toolsApi.listRuntimeSlots(companyId),
    refetchInterval: 15_000,
  });
  const health = useQuery({
    queryKey: queryKeys.tools.runtimeHealth(companyId),
    queryFn: () => toolsApi.getRuntimeHealth(companyId),
    refetchInterval: 15_000,
  });
  const connections = useQuery({
    queryKey: queryKeys.tools.connections(companyId),
    queryFn: () => toolsApi.listConnections(companyId),
    refetchInterval: 15_000,
  });

  const invalidateRuntime = () => {
    qc.invalidateQueries({ queryKey: queryKeys.tools.runtimeSlots(companyId) });
    qc.invalidateQueries({ queryKey: queryKeys.tools.runtimeHealth(companyId) });
    qc.invalidateQueries({ queryKey: queryKeys.tools.connections(companyId) });
  };

  const stopSlot = useMutation({
    mutationFn: (slotId: string) => toolsApi.stopRuntimeSlot(companyId, slotId),
    onSuccess: () => {
      invalidateRuntime();
      pushToast({ title: t("auditRuntime.runtime.toast.appStopped"), tone: "success" });
    },
    onError: (err) =>
      pushToast({ title: t("auditRuntime.runtime.toast.stopFailed"), body: err instanceof ApiError ? err.message : String(err), tone: "error" }),
    onSettled: () => setConfirm(null),
  });

  const restartSlot = useMutation({
    mutationFn: (slotId: string) => toolsApi.restartRuntimeSlot(companyId, slotId),
    onSuccess: () => {
      invalidateRuntime();
      pushToast({ title: t("auditRuntime.runtime.toast.appRestarted"), tone: "success" });
    },
    onError: (err) =>
      pushToast({ title: t("auditRuntime.runtime.toast.restartFailed"), body: err instanceof ApiError ? err.message : String(err), tone: "error" }),
    onSettled: () => setConfirm(null),
  });

  const rows = useMemo<RuntimeRow[]>(() => {
    const list = slots.data?.runtimeSlots ?? [];
    const byId = new Map((connections.data?.connections ?? []).map((c) => [c.id, c] as const));
    return list.map((slot) => {
      const connection = slot.connectionId ? byId.get(slot.connectionId) ?? null : null;
      return {
        slot,
        connection,
        name: humanizeRowName(slot, connection),
        isLocal: slot.runtimeKind === "local_stdio",
        status: rowStatusFor(slot, connection),
      };
    });
  }, [slots.data, connections.data]);

  if (slots.isLoading || health.isLoading || connections.isLoading) return <LoadingState />;
  if (slots.error || health.error) {
    return (
      <ErrorState
        error={slots.error ?? health.error}
        onRetry={() => {
          slots.refetch();
          health.refetch();
          connections.refetch();
        }}
      />
    );
  }

  const metrics = health.data?.metrics as ToolRuntimeMetricSnapshot | undefined;
  const firingAlerts = (health.data?.alerts ?? []).filter((a) => a.status === "firing");

  const workingCount = rows.filter((r) => r.status === "working").length;
  const attentionCount = rows.filter((r) => r.status === "attention").length;
  const totalCount = rows.length;
  const localAttentionRow = rows.find((r) => r.status === "attention" && r.isLocal) ?? null;

  const errors = (metrics?.toolFailuresLastHour ?? 0) + (metrics?.toolTimeoutsLastHour ?? 0);

  const beginRestart = (row: RuntimeRow) =>
    setConfirm({ kind: "restart", slotId: row.slot.id, name: row.name });
  const beginStop = (row: RuntimeRow) => setConfirm({ kind: "stop", slotId: row.slot.id, name: row.name });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <ToolsPageHeader title={t("auditRuntime.common.health")} description={t("auditRuntime.runtime.description")} />
        <LivePill />
      </div>

      {/* Summary strip — plain words; ops vocabulary lives in tooltips. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          label={t("auditRuntime.runtime.summary.appsRunning")}
          value={totalCount === 0 ? t("auditRuntime.runtime.summary.none") : t("auditRuntime.common.appsOf", { working: workingCount, total: totalCount })}
          note={
            totalCount === 0
              ? t("auditRuntime.runtime.summary.appsStartOnNeed")
              : attentionCount > 0
                ? t(attentionCount === 1 ? "auditRuntime.runtime.summary.needsAttentionSingular" : "auditRuntime.runtime.summary.needsAttention", { count: attentionCount })
                : t("auditRuntime.runtime.summary.allWorking")
          }
        />
        <SummaryCard
          label={t("auditRuntime.runtime.summary.typicalResponse")}
          value={formatTypicalLatency(metrics?.averageToolLatencyMsLastHour, t)}
          note={
            metrics?.averageToolLatencyMsLastHour == null
              ? t("auditRuntime.runtime.summary.noCallsLastHour")
              : (metrics?.timeoutRateLastHour ?? 0) >= 10
                ? t("auditRuntime.runtime.summary.slowerThanUsual")
                : t("auditRuntime.runtime.summary.acrossAllApps")
          }
          detail={t("auditRuntime.runtime.summary.slowestP95", { latency: formatTypicalLatency(metrics?.p95ToolLatencyMsLastHour, t), rate: metrics?.timeoutRateLastHour ?? 0 })}
        />
        <SummaryCard
          label={t("auditRuntime.runtime.summary.errorsLastHour")}
          value={String(errors)}
          note={errors === 0 ? t("auditRuntime.runtime.summary.none") : t("auditRuntime.runtime.summary.acrossYourApps")}
          detail={t("auditRuntime.runtime.summary.errorBreakdown", { failures: metrics?.toolFailuresLastHour ?? 0, timeouts: metrics?.toolTimeoutsLastHour ?? 0, deferrals: metrics?.capacityDeferralsLastHour ?? 0 })}
        />
      </div>

      {/* Needs-attention cards — one per firing supervisor alert, in plain words. */}
      {firingAlerts.map((alert) => {
        const action = alertAction(alert);
        const detailsOpen = openAlertDetails[alert.name] ?? false;
        return (
          <Card key={alert.name} className="overflow-hidden border-foreground/30 py-0">
            <CardContent className="relative space-y-3 py-4 pl-6">
              <span className="absolute inset-y-0 left-0 w-1.5 bg-foreground" />
              <div>
                <p className="text-base font-bold text-foreground">▲ {plainAlertTitle(alert, t)}</p>
                <p className="mt-1 max-w-2xl text-sm text-foreground/80">{plainAlertBody(alert, t)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {action === "restart" && localAttentionRow ? (
                  <Button size="sm" onClick={() => beginRestart(localAttentionRow)}>
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                    Restart {localAttentionRow.name}
                  </Button>
                ) : action === "reviewApps" ? (
                  <Button size="sm" asChild>
                    <Link to="/apps/attention">{t("auditRuntime.runtime.reviewApps")}</Link>
                  </Button>
                ) : (
                  <Button size="sm" asChild>
                    <Link to="/apps/advanced/audit">{t("auditRuntime.runtime.reviewActivity")}</Link>
                  </Button>
                )}
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setOpenAlertDetails((s) => ({ ...s, [alert.name]: !detailsOpen }))}
                >
                  <Disclosure open={detailsOpen} label={t("auditRuntime.runtime.technicalDetails")} />
                </button>
              </div>
              {detailsOpen ? (
                <dl className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-2">
                  <Fact label={t("auditRuntime.runtime.alert")} value={<span className="font-mono">{alert.name}</span>} />
                  <Fact label={t("auditRuntime.runtime.severity")} value={alert.severity} />
                  <Fact label={t("auditRuntime.runtime.threshold")} value={alert.threshold} />
                  <Fact label={t("auditRuntime.runtime.observed")} value={alert.observed} />
                  <Fact label={t("auditRuntime.runtime.firstResponder")} value={alert.firstResponderAction} />
                  <Fact label={t("auditRuntime.runtime.runbook")} value={<span className="font-mono">{alert.runbookSection || health.data?.runbookPath}</span>} />
                </dl>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {/* Status table — one row per running app. */}
      {totalCount === 0 ? (
        <EmptyState
          icon={Server}
          message={t("auditRuntime.runtime.noAppsRunning")}
          description={t("auditRuntime.runtime.noAppsRunningHint")}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="px-0 py-0">
            <div className="px-5 pb-1 pt-4">
              <h3 className="text-base font-bold text-foreground">{t("auditRuntime.runtime.runningApps")}</h3>
              <p className="text-xs text-muted-foreground">{t("auditRuntime.runtime.rowHint")}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-2.5">{t("auditRuntime.runtime.app")}</th>
                  <th className="px-3 py-2.5">{t("auditRuntime.common.health")}</th>
                  <th className="px-3 py-2.5">{t("auditRuntime.runtime.lastUsed")}</th>
                  <th className="px-5 py-2.5 text-right">{t("auditRuntime.runtime.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const open = expanded[row.slot.id] ?? false;
                  const busy =
                    (stopSlot.isPending && stopSlot.variables === row.slot.id) ||
                    (restartSlot.isPending && restartSlot.variables === row.slot.id);
                  return (
                    <RuntimeRowView
                      key={row.slot.id}
                      row={row}
                      open={open}
                      busy={busy}
                      onToggle={() => setExpanded((s) => ({ ...s, [row.slot.id]: !open }))}
                      onRestart={() => beginRestart(row)}
                      onStop={() => beginStop(row)}
                    />
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {t("auditRuntime.runtime.remoteHint")}
      </p>

      <ConfirmDialog
        target={confirm}
        pending={stopSlot.isPending || restartSlot.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "restart") restartSlot.mutate(confirm.slotId);
          else stopSlot.mutate(confirm.slotId);
        }}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function RuntimeRowView({
  row,
  open,
  busy,
  onToggle,
  onRestart,
  onStop,
}: {
  row: RuntimeRow;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onRestart: () => void;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const { slot, connection, name, isLocal, status } = row;
  const canControl = isLocal && status !== "off";
  return (
    <>
      <tr className="cursor-pointer align-middle hover:bg-accent/40" onClick={onToggle}>
        <td className="px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
            <StatusMarker status={status} />
            {connection ? (
              <Link
                to={`/apps/${connection.id}`}
                className="font-semibold text-foreground hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {name}
              </Link>
            ) : (
              <span className="font-semibold text-foreground">{name}</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={status === "attention" ? "font-semibold text-foreground" : "text-foreground"}>
              {t(STATUS_WORD[status])}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <RelativeTime value={slot.lastUsedAt} />
        </td>
        <td className="px-5 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
          {isLocal ? (
            <Button size="sm" variant="outline" disabled={busy || status === "off"} onClick={onRestart}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1.5 h-3.5 w-3.5" />}
              {t("auditRuntime.runtime.restart")}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{t("toolsResidualRound2.runsProviderSide")}</span>
          )}
        </td>
      </tr>
      {open ? (
        <tr className="bg-muted/40">
          <td colSpan={4} className="px-5 py-4">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3">
              <Fact label={t("auditRuntime.runtime.slotKey")} value={<span className="font-mono text-xs">{slot.slotKey ?? slot.commandTemplateKey ?? slot.id}</span>} />
              <Fact label={t("auditRuntime.runtime.howItRuns")} value={howItRuns(slot, t)} />
              <Fact label={t("auditRuntime.runtime.processId")} value={slot.processId ?? "—"} />
              <Fact label={t("auditRuntime.runtime.scope")} value={scopeLabel(slot.ownerScopeType, t)} />
              <Fact label={t("auditRuntime.runtime.trustTier")} value={trustTierLabel(slot, t)} />
              <Fact label={t("auditRuntime.runtime.started")} value={<RelativeTime value={slot.lastStartedAt ?? slot.startedAt} />} />
            </dl>
            {slot.lastError ? (
              <p className="mt-3 text-xs text-destructive">{t("auditRuntime.runtime.lastError")}: {slot.lastError}</p>
            ) : null}
            <div className="mt-4 flex items-center gap-2">
              {canControl ? (
                <>
                  <Button size="sm" variant="outline" disabled={busy} onClick={onStop}>
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Square className="mr-1.5 h-3.5 w-3.5" fill="currentColor" />}
                    {t("auditRuntime.runtime.stop")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={onRestart}>
                    {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1.5 h-3.5 w-3.5" />}
                    {t("auditRuntime.runtime.restart")}
                  </Button>
                </>
              ) : !isLocal ? (
                <p className="text-xs text-muted-foreground">
                  {t("auditRuntime.runtime.providerSideHint")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("auditRuntime.runtime.offHint")}</p>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ConfirmDialog({
  target,
  pending,
  onCancel,
  onConfirm,
}: {
  target: ConfirmTarget | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const isRestart = target?.kind === "restart";
  return (
    <Dialog open={!!target} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(isRestart ? "auditRuntime.runtime.confirm.restartTitle" : "auditRuntime.runtime.confirm.stopTitle", { name: target?.name })}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-foreground">
          {isRestart ? (
            <>
              <p>
                {t("auditRuntime.runtime.confirm.restartBody", { name: target?.name })}
              </p>
              <p className="text-xs text-muted-foreground">{t("auditRuntime.runtime.confirm.restartHint")}</p>
            </>
          ) : (
            <>
              <p>
                {t("auditRuntime.runtime.confirm.stopBody", { name: target?.name })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("auditRuntime.runtime.confirm.stopHint")}
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {t("auditRuntime.runtime.cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {t(isRestart ? "auditRuntime.runtime.restart" : "auditRuntime.runtime.stop")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
