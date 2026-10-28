import { TabFilters } from "@/components/TabBar";
import { t } from "@/i18n";

export const CATALOG_SOURCES = ["paperclip", "composio", "arcade", "installed", "all"] as const;
export type CatalogSource = typeof CATALOG_SOURCES[number];
export const CATALOG_SOURCE_NAMES = { paperclip: "Paperclip", composio: "Composio", arcade: "Arcade", executor: "Executor", installed: "Installed", all: "All" };

export function CatalogSourceFilters({ source, onChange }: { source: CatalogSource; onChange: (source: CatalogSource) => void }) {
  return <TabFilters label={t("upgrade1029NewPages.catalog.appFilters")} size="standard" items={CATALOG_SOURCES.map(value => ({ value, label: value === "installed" ? t("adapterTools.agentTools.installed") : value === "all" ? t("activity.filters.all") : CATALOG_SOURCE_NAMES[value] }))} value={source} onValueChange={onChange} />;
}
