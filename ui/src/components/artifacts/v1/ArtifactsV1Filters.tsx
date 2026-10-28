import type { ArtifactGroupBy, ArtifactKindFilter } from "@/api/artifacts";
import { TabFilters, type TabBarItem } from "@/components/TabBar";
import { t } from "@/i18n";

/**
 * The Artifacts page's one row of views (mock node 2129:133457): Tasks —
 * one tile per task, the default — then every file flat, by type. Grouping
 * and the kind filter are still two URL parameters; a view maps onto both.
 */
export type ArtifactsV1View = "tasks" | Exclude<ArtifactKindFilter, never>;

export const ARTIFACTS_V1_VIEWS: TabBarItem<ArtifactsV1View>[] = [
  { value: "tasks", get label() { return t("coreNavigation.search.tasks"); } },
  { value: "all", get label() { return t("upgrade1029NewComponents.artifactsV1Filters.allFiles"); } },
  { value: "image", get label() { return t("coreNavigation.artifacts.images"); } },
  { value: "video", get label() { return t("coreNavigation.artifacts.videos"); } },
  { value: "document", get label() { return t("coreNavigation.artifacts.documents"); } },
  { value: "text", get label() { return t("coreNavigation.artifacts.text"); } },
  { value: "file", get label() { return t("coreNavigation.artifacts.files"); } },
];

/** Any grouping reads as the Tasks view; flat views are named by their kind. */
export const artifactsV1View = (groupBy: ArtifactGroupBy, kind: ArtifactKindFilter): ArtifactsV1View => (groupBy !== "none" ? "tasks" : kind);

export function ArtifactsV1Filters({ view, onViewChange }: { view: ArtifactsV1View; onViewChange: (view: ArtifactsV1View) => void }) {
  return <TabFilters items={ARTIFACTS_V1_VIEWS} value={view} onValueChange={onViewChange} size="standard" label={t("upgrade1029NewComponents.artifactsV1Filters.showBy")} />;
}
