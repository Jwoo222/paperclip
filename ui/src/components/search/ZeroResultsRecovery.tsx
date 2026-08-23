import { FilterX, RotateCcw } from "lucide-react";
import type { CompanySearchZeroResults } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import {
  clearFilterDimension,
  countActiveFilters,
  type FilterChipLookups,
  type SearchFilters,
} from "@/lib/search-filters";

function humanize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function localizedSuggestion(
  filterKey: string,
  values: string[],
  lookups: FilterChipLookups,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  const label = (key: string) => translate(`searchStatus.filter.${key}`);
  const status = (value: string) => translate(`searchStatus.status.${value}`, { defaultValue: humanize(value) });
  const priority = (value: string) => translate(`searchStatus.priority.${value}`, { defaultValue: humanize(value) });
  switch (filterKey) {
    case "status":
      return `${label("status")}: ${values.map(status).join(", ")}`;
    case "priority":
      return `${label("priority")}: ${values.map(priority).join(", ")}`;
    case "assigneeAgentId":
      return `${label("assignee")}: ${values.map((id) => lookups.agentName(id) ?? translate("searchStatus.source.agent")).join(", ")}`;
    case "assigneeUserId":
      return `${label("assignee")}: ${values.map((id) => (id === lookups.currentUserId ? translate("searchStatus.assignee.me") : lookups.userName(id) ?? translate("searchStatus.source.user"))).join(", ")}`;
    case "projectId":
      return `${label("project")}: ${values.map((id) => lookups.projectName(id) ?? translate("searchStatus.source.project")).join(", ")}`;
    case "labelId":
      return `${label("label")}: ${values.map((id) => lookups.labelName(id) ?? translate("searchStatus.source.label")).join(", ")}`;
    case "updatedWithin":
    case "updatedAfter":
      return label("updated");
    default:
      return humanize(filterKey);
  }
}

export function ZeroResultsRecovery({
  query,
  filters,
  zeroResults,
  lookups,
  onChange,
  onClearAll,
}: {
  query: string;
  filters: SearchFilters;
  zeroResults: CompanySearchZeroResults;
  lookups: FilterChipLookups;
  onChange: (next: SearchFilters) => void;
  onClearAll: () => void;
}) {
  const { t } = useTranslation();
  const activeCount = countActiveFilters(filters);
  const { unfilteredTotal } = zeroResults;
  // Rank suggestions by how many results each one recovers (highest impact first).
  const suggestions = [...zeroResults.loosenSuggestions].sort(
    (a, b) => b.additionalCount - a.additionalCount,
  );

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-12 text-center"
      data-testid="search-zero-results-recovery"
    >
      <FilterX className="h-10 w-10 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <div className="text-base font-semibold">{t("searchStatus.zero.noResultsWithFilters")}</div>
        <p className="text-sm text-muted-foreground">
          {t(unfilteredTotal === 1 ? "searchStatus.zero.resultMatches" : "searchStatus.zero.resultsMatch", { count: unfilteredTotal })}
          {query ? <> &ldquo;{query}&rdquo;</> : null}, {t(activeCount === 1 ? "searchStatus.zero.oneFilterHides" : "searchStatus.zero.filtersHide", { count: activeCount })}
        </p>
      </div>

      {suggestions.length > 0 ? (
        <div className="flex w-full flex-col gap-1.5">
          <div className="text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
            {t("searchStatus.zero.loosenFilter")}
          </div>
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.filter}:${suggestion.values.join(",")}`}
              type="button"
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left text-sm hover:border-foreground/30 hover:bg-accent/40"
              onClick={() => onChange(clearFilterDimension(filters, suggestion.filter))}
            >
              <span className="min-w-0 truncate">
                {t("searchStatus.zero.remove")} {" "}
                <span className="font-medium">
                  {localizedSuggestion(suggestion.filter, suggestion.values, lookups, t)}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">
                +{suggestion.additionalCount} {t(suggestion.additionalCount === 1 ? "searchStatus.zero.result" : "searchStatus.zero.results")}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <Button onClick={onClearAll} variant="default" size="sm">
        <RotateCcw className="mr-1.5 h-4 w-4" />
        {t("searchStatus.zero.clearAllFilters")}
      </Button>
    </div>
  );
}
