import type { CostByAgent } from "@paperclipai/shared";
import { Badge } from "./ui/badge";
import { t } from "@/i18n";

/** Use this group's ledger counts, never the page-wide estimate count. */
export function CostEstimateLabel({
  eventCount,
  estimatedEventCount,
}: Partial<Pick<CostByAgent, "eventCount" | "estimatedEventCount">>) {
  if (!estimatedEventCount) return null;
  const allEstimated = estimatedEventCount === eventCount;
  return (
    <Badge
      variant="outline"
      className="font-normal text-muted-foreground"
      title={t("upgrade1029NewComponents.costEstimateLabel.title", { count: estimatedEventCount })}
    >
      {allEstimated ? t("overview.costs.estimated") : t("upgrade1029NewComponents.costEstimateLabel.partiallyEstimated")}
    </Badge>
  );
}
