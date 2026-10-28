import type { ProviderQuotaResult } from "@paperclipai/shared";
import { t } from "@/i18n";
import { formatDateTime } from "../lib/utils";
import { QuotaBar } from "./QuotaBar";
import { quotaUnavailableMessage } from "../lib/quota-refresh";

export function AccountQuotaPanels({
  accounts,
  failed,
}: {
  accounts: ProviderQuotaResult[];
  failed?: boolean;
}) {
  return (
    <div className="space-y-4">
      {accounts.map((account) => (
        <section
          className="space-y-2"
          key={account.accountKey ?? account.provider}
        >
          <p className="text-sm font-medium">
            {account.accountLabel ?? t("upgrade1029NewComponents.accountQuotaPanels.subscriptionAccount")}
          </p>
          {(failed || !account.ok) && (
            <p className="text-sm text-muted-foreground">
              {account.errorFamily === "credentials_unavailable"
                ? t("upgrade1029NewComponents.accountQuotaPanels.connectToViewQuota")
                : quotaUnavailableMessage(account.windows.length > 0)}
            </p>
          )}
          {account.windows.map((window, index) => window.usedPercent == null ? (
            <div key={`${window.label}:${index}`} className="space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <span>{window.label}</span>
                <span className="font-mono text-muted-foreground">{window.valueLabel ?? t("upgrade1029NewComponents.accountQuotaPanels.usageNotReported")}</span>
              </div>
              {window.resetsAt && <p className="text-xs font-mono text-muted-foreground">{t("upgrade1029NewComponents.accountQuotaPanels.resetsAt", { date: formatDateTime(window.resetsAt) })}</p>}
            </div>
          ) : (
            <QuotaBar
              key={`${window.label}:${index}`}
              className="font-mono"
              label={window.label}
              percentUsed={window.usedPercent}
              leftLabel={
                window.valueLabel ??
                (window.usedPercent === null
                  ? t("upgrade1029NewComponents.accountQuotaPanels.usageNotReported")
                  : t("upgrade1029NewComponents.accountQuotaPanels.percentUsed", { percent: window.usedPercent }))
              }
              rightLabel={
                window.resetsAt
                  ? t("upgrade1029NewComponents.accountQuotaPanels.resetsAt", { date: formatDateTime(window.resetsAt) })
                  : undefined
              }
            />
          ))}
          {account.capturedAt && (
            <p className="text-xs font-mono text-muted-foreground">
              {t("upgrade1029NewComponents.accountQuotaPanels.lastChecked", { date: formatDateTime(account.capturedAt) })}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
