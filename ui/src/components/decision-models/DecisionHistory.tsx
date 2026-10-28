import { useQuery } from "@tanstack/react-query";
import type { DecisionHistoryEntry } from "@paperclipai/shared";
import { decisionModelsApi } from "@/api/decision-models";
import { Link } from "@/lib/router";
import { formatDateTime, formatTokens, formatDetailedCents } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export function DecisionHistoryTable({ entries, fastResponse = false, fastResponsesEnabled = true }: { entries: (DecisionHistoryEntry & { publicationStatus?: string; connectionName?: string | null })[]; fastResponse?: boolean; fastResponsesEnabled?: boolean }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">{fastResponse ? t("upgrade1029NewComponents.decisionHistory.noFastResponses") : t("upgrade1029NewComponents.decisionHistory.noDecisionRequests")} <Link to={fastResponse && !fastResponsesEnabled ? "/company/settings/instance/experimental" : "/company/settings/connections"} className="underline underline-offset-4">{fastResponse ? fastResponsesEnabled ? t("upgrade1029NewComponents.decisionHistory.configureFastResponse") : t("upgrade1029NewComponents.decisionHistory.enableExperimentalFastResponses") : t("upgrade1029NewComponents.decisionHistory.configureDecisionModel")}</Link> {t("upgrade1029NewComponents.decisionHistory.toRunATest")}</p>;
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.decisionHistory.recentRequests")}</p>
    <div className="overflow-x-auto"><table className="w-full text-sm" aria-label={fastResponse ? t("upgrade1029NewComponents.decisionHistory.fastResponses") : t("upgrade1029NewComponents.decisionHistory.decisionRequests")}>
      <thead><tr className="border-b border-border text-muted-foreground">{["upgrade1029NewComponents.decisionHistory.whenFeature", "taskDetail.responsible", "taskDetail.task", ...(fastResponse ? ["newUi.k639a40e82b9a"] : []), "taskDetail.model", "casesExtra.column.status", "upgrade1029NewComponents.decisionHistory.duration", "upgrade1029NewComponents.decisionHistory.tokensInOut", "agentManagement.detail.cost"].map(labelKey => <th key={labelKey} className="px-3 py-2 text-left font-medium">{t(labelKey)}</th>)}</tr></thead>
      <tbody>{entries.map(row => <tr key={row.id} className="border-b border-border last:border-0">
        <td className="px-3 py-3"><div className="whitespace-nowrap">{formatDateTime(row.startedAt)}</div><div className="text-xs text-muted-foreground">{row.feature === "settings.test" ? t("upgrade1029NewComponents.decisionHistory.setupTest") : row.feature}</div></td>
        <td className="px-3 py-3">{row.actorType === "system" ? t("upgrade1029NewComponents.decisionHistory.paperclipServices") : row.userName ?? (row.responsibleUserId === "local-board" ? t("taskDetail.board") : t("upgrade1029NewComponents.decisionHistory.formerUser"))}</td>
        <td className="px-3 py-3">{row.issueId ? <Link className="underline underline-offset-4" to={`/issues/${row.issueIdentifier ?? row.issueId}`}>{row.issueIdentifier ?? t("issueProperties.viewTask")}</Link> : "—"}</td>
        {fastResponse && <td className="px-3 py-3">{row.connectionName ?? (row.connectionId ? t("upgrade1029NewComponents.decisionHistory.removedConnection") : "—")}</td>}
        <td className="px-3 py-3 font-mono text-xs">{row.model}</td>
        <td className="px-3 py-3"><div>{row.status === "succeeded" ? t("statusResidualRound3.status.succeeded") : row.status === "running" ? t("statusResidualRound3.status.running") : row.status === "unknown" ? t("upgrade1029NewComponents.decisionHistory.unresolved") : row.status === "skipped" ? t("statusResidualRound3.status.skipped") : row.status === "pending" ? t("taskDetailExtra.pending") : t("newUi.k031a8f0f659d")}</div>{row.publicationStatus && <div className="text-xs text-muted-foreground">{row.publicationStatus}</div>}{row.errorCode && <div className="text-xs text-muted-foreground">{row.errorCode.replaceAll("_", " ")}</div>}</td>
        <td className="px-3 py-3 font-mono">{row.durationMs === null ? "—" : `${(row.durationMs / 1000).toFixed(1)}s`}</td>
        <td className="whitespace-nowrap px-3 py-3 font-mono">{row.inputTokens === null ? "—" : formatTokens(row.inputTokens)} / {row.outputTokens === null ? "—" : formatTokens(row.outputTokens)}</td>
        <td className="px-3 py-3 font-mono"><div>{row.costCents === null ? t("work.columns.unknown") : formatDetailedCents(row.costCents)}</div>{row.costStatus !== "unpriced" && row.costStatus && <span className="text-xs text-muted-foreground">{row.costStatus === "estimated" ? t("overview.costs.estimated") : t("upgrade1029NewComponents.decisionHistory.reported")}</span>}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
export function DecisionHistory({ companyId, from, to }: { companyId: string; from?: string | null; to?: string | null }) {
  const query = useQuery({ queryKey: ["decision-history", companyId, from, to], queryFn: () => decisionModelsApi.history(companyId, from, to), refetchInterval: q => q.state.data?.some(row => row.status === "running") ? 5000 : false });
  if (query.isPending) return <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.decisionHistory.loadingDecisionRequests")}</p>;
  if (query.error) return <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{t("upgrade1029NewComponents.decisionHistory.couldNotLoad")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("taskDetail.tryAgain")}</Button></div>;
  return <DecisionHistoryTable entries={query.data ?? []} />;
}
