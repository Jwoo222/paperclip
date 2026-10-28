import type { FinanceByKind } from "@paperclipai/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { financeEventKindDisplayName, formatCents } from "@/lib/utils";
import { i18n, useTranslation } from "@/i18n";

interface FinanceKindCardProps {
  rows: FinanceByKind[];
}

export function FinanceKindCard({ rows }: FinanceKindCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-1">
        <CardTitle className="text-base">{t("sharedOperationsExtra.financialEventMix")}</CardTitle>
        <CardDescription>{t("sharedOperationsExtra.financialEventMixDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 pt-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("sharedOperationsExtra.noFinanceEvents")}</p>
        ) : (
          rows.map((row) => (
            <div
              key={`${row.eventKind}:${row.currency}`}
              className="flex items-center justify-between gap-3 border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{financeEventKindDisplayName(row.eventKind)}</div>
                <div className="text-xs text-muted-foreground">
                  {t("sharedOperationsExtra.eventCount", { count: row.eventCount, suffix: i18n.language === "ko" ? "" : row.eventCount === 1 ? "" : "s" })} · {t("sharedOperationsExtra.billerCount", { count: row.billerCount, suffix: i18n.language === "ko" ? "" : row.billerCount === 1 ? "" : "s" })}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="text-sm font-medium">{formatCents(row.netCents, row.currency)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatCents(row.debitCents, row.currency)} {t("sharedOperationsExtra.debits")}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
