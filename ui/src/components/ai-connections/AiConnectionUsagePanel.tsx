import { useMutation } from "@tanstack/react-query";
import type { AiConnectionUsage, AiConnectionUsageLimit, AiManagedConnectionSummary } from "@paperclipai/shared";
import { supportsAiConnectionUsage } from "@paperclipai/shared";
import { aiConnectionsApi } from "@/api/ai-connections";
import { Button } from "@/components/ui/button";
import { QuotaBar } from "@/components/QuotaBar";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { t } from "@/i18n";

const usageNumber = (value: number) => formatNumber(value, { maximumFractionDigits: 20 });
const amount = (value: number, unit: string | null) => unit === "USD"
  ? formatNumber(value, { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 20 })
  : `${usageNumber(value)}${unit ? ` ${unit}` : ""}`;

function limitLabel(window: AiConnectionUsageLimit) {
  const label = window.label.replace(/\b(\d+(?:\.\d+)?) hour limit\b/i, "$1h").replace(/\bweekly limit\b/i, t("upgrade2610Apps.usage.weekly"));
  if (window.windowDurationSeconds == null) return label;
  const hours = window.windowDurationSeconds / 3600;
  const period = hours === 168 ? t("upgrade2610Apps.usage.weekly") : `${usageNumber(hours)}h`;
  if (/\b(?:Primary|Secondary)$/.test(label)) return `${label} · ${period}`;
  if ((hours === 168 && /weekly/i.test(label)) || label.split(/[\s·()]+/).includes(period)) return label;
  return `${label} · ${period}`;
}

function limitValue(window: AiConnectionUsageLimit) {
  if (window.used === 0 && window.limit === 0) return t("upgrade2610Apps.usage.cap", { amount: amount(window.limit, window.unit) });
  if (window.used != null && window.limit != null) return t("upgrade2610Apps.usage.usedOfLimit", { used: amount(window.used, window.unit), limit: amount(window.limit, window.unit) });
  if (window.usedPercent != null) return t("upgrade2610Apps.usage.percentUsed", { percent: usageNumber(window.usedPercent) });
  if (window.used != null) return t("upgrade2610Apps.usage.amountUsed", { amount: amount(window.used, window.unit) });
  if (window.remainingPercent != null) return t("upgrade2610Apps.usage.percentLeft", { percent: usageNumber(window.remainingPercent) });
  return t("upgrade2610Apps.usage.notReported");
}

function limitDetails(window: AiConnectionUsageLimit) {
  const details: string[] = [];
  if (window.allowed === false) details.push(t("upgrade2610Apps.usage.blocked"));
  else if (window.limitReached === true) details.push(t("upgrade2610Apps.usage.limitReached"));
  if (window.allowed === true && (window.limitReached === true || window.usedPercent == null)) details.push(t("upgrade2610Apps.usage.usageAllowed"));
  if (window.used == null || window.limit == null) {
    if (window.remaining != null) details.push(t("upgrade2610Apps.usage.amountLeft", { amount: amount(window.remaining, window.unit) }));
    if (window.limit != null) details.push(t("upgrade2610Apps.usage.cap", { amount: amount(window.limit, window.unit) }));
  }
  if (window.resetsAt) details.push(t("upgrade2610Apps.usage.resets", { time: formatDateTime(window.resetsAt, { includeYear: false }) }));
  else if (window.resetInterval) details.push(t("upgrade2610Apps.usage.resets", { time: window.resetInterval }));
  return details.join(" · ");
}

function overageSummary(usage: AiConnectionUsage) {
  const overage = usage.overage!;
  const details = [overage.available === true ? t("upgrade2610Apps.usage.available")
    : overage.enabled === false ? t("upgrade2610Apps.usage.off")
    : overage.available === false ? (overage.enabled === true ? t("upgrade2610Apps.usage.onUnavailable") : t("upgrade2610Apps.usage.unavailable"))
    : overage.enabled === true ? t("upgrade2610Apps.usage.onAvailabilityUnknown") : t("upgrade2610Apps.usage.notReported")];
  if (overage.unlimited === true) details.push(t("upgrade2610Apps.usage.unlimited"));
  else if (overage.balance != null && (overage.balance !== 0 || overage.enabled !== false)) details.push(amount(overage.balance, overage.unit));
  if (overage.remaining != null && (overage.remaining !== 0 || overage.enabled !== false)
    && !usage.limits.some((window) => window.scope === "overage" && window.remaining === overage.remaining && window.unit === overage.unit)) {
    details.push(t("upgrade2610Apps.usage.amountLeft", { amount: amount(overage.remaining, overage.unit) }));
  }
  return details.join(" · ");
}

function usageError(usage: AiConnectionUsage) {
  switch (usage.errorCode) {
    case "authentication_required": return t("upgrade2610Apps.usage.errors.authenticationRequired");
    case "permission_denied": return t("upgrade2610Apps.usage.errors.permissionDenied");
    case "rate_limited": return t("upgrade2610Apps.usage.errors.rateLimited");
    case "provider_unavailable": return t("upgrade2610Apps.usage.errors.providerUnavailable");
    case "invalid_response": return t("upgrade2610Apps.usage.errors.invalidResponse");
    case "connection_unavailable": return t("upgrade2610Apps.usage.errors.connectionUnavailable");
    case "unsupported": return t("upgrade2610Apps.usage.errors.unsupported");
    default: return usage.message ?? t("upgrade2610Apps.usage.errors.unsupported");
  }
}

export function AiConnectionUsagePanel({ account, observation, cachedOnly = false }: { account: AiManagedConnectionSummary; observation?: AiConnectionUsage; cachedOnly?: boolean }) {
  const probe = useMutation({
    mutationFn: () => aiConnectionsApi.probeUsage(account.companyId, account.id, account.grantId),
  });
  const supported = supportsAiConnectionUsage(account.provider, account.method);
  const usage = cachedOnly ? observation : probe.isSuccess ? probe.data : undefined;
  return (
    <section aria-label={t("upgrade2610Apps.usage.ariaLabel")} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t("upgrade2610Apps.usage.title")}</h3>
        {supported && !cachedOnly && <Button variant="outline" size="sm" disabled={probe.isPending || account.status !== "connected"} onClick={() => probe.mutate()}>
          {probe.isPending ? t("appsConnect.common.checking") : usage?.status === "ok" ? t("commonControls.refresh") : t("upgrade2610Apps.usage.checkUsage")}
        </Button>}
      </div>
      {cachedOnly && !usage && <p className="text-xs text-muted-foreground">{t("upgrade1029ConflictsB.aiConnections.usageNotObserved")}</p>}
      {!supported && <p className="text-xs text-muted-foreground">{t("upgrade2610Apps.usage.unsupportedMethod")}</p>}
      {probe.error && <p role="alert" className="text-sm text-destructive">{probe.error.message}</p>}
      {usage && usage.status !== "ok" && <p role={usage.status === "unsupported" ? "status" : "alert"} className="text-sm text-muted-foreground">{usageError(usage)}</p>}
      {usage?.status === "ok" && (
        <div className="space-y-3" aria-live="polite">
          {usage.limits.length === 0 && <p className="text-xs text-muted-foreground">{t("upgrade2610Apps.usage.usageNotReported")}</p>}
          {usage.limits.map((window) => {
            const details = limitDetails(window);
            return <div key={window.id} className="space-y-1.5">
              {window.usedPercent != null ? <QuotaBar label={limitLabel(window)} percentUsed={window.usedPercent} leftLabel={limitValue(window)} />
                : <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{limitLabel(window)}</span>
                  <span className="font-mono">{limitValue(window)}</span>
                </div>}
              {details && <p className="text-xs text-muted-foreground">{details}</p>}
            </div>;
          })}
          {usage.overage && <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{t("upgrade2610Apps.usage.overage")}</span>
            <span className="font-mono">{overageSummary(usage)}</span>
          </div>}
          <p className="text-xs text-muted-foreground">{t("upgrade2610Apps.usage.updated")} <time className="font-mono" dateTime={usage.checkedAt} title={formatDateTime(usage.checkedAt)}>{formatDateTime(usage.checkedAt, { includeYear: false })}</time>{usage.planType ? ` · ${usage.planType}` : ""}</p>
        </div>
      )}
    </section>
  );
}
