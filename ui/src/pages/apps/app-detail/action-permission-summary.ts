import { t as tNewUi } from "@/i18n";
import type { ToolCatalogEntry } from "@paperclipai/shared";

export type ActionPermissionSummary = {
  allowedCount: number;
  askFirstCount: number;
  offCount: number;
};

export function summarizeActionPermissions(
  entries: ToolCatalogEntry[],
  enabledIds: Set<string>,
  askFirstIds: Set<string>,
): ActionPermissionSummary {
  let allowedCount = 0;
  let askFirstCount = 0;
  let offCount = 0;

  for (const entry of entries) {
    if (!enabledIds.has(entry.id)) {
      offCount += 1;
    } else if (askFirstIds.has(entry.id)) {
      askFirstCount += 1;
    } else {
      allowedCount += 1;
    }
  }

  return { allowedCount, askFirstCount, offCount };
}

function summaryCount(label: string, count: number): string {
  return `${label} ${count}${count === 1 ? " action" : ""}`;
}

export function formatActionPermissionSummary(summary: ActionPermissionSummary): string {
  return [
    summaryCount(tNewUi("newUi.kb1d20f770e9e"), summary.allowedCount),
    summaryCount(tNewUi("newUi.kd8f62bd19898"), summary.askFirstCount),
    summaryCount(tNewUi("newUi.ka0b8d25186a4"), summary.offCount),
  ].join(" · ");
}
