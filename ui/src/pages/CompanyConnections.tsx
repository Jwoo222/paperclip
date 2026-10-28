import { useEffect } from "react";
import { Link2 } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { DecisionModelSettingsSection } from "../components/decision-models/DecisionModelSettings";
import { FastResponseSettingsSection } from "../components/fast-responses/FastResponseSettings";
import { useFastResponsesEnabled } from "../hooks/useFastResponsesEnabled";
import { PromptInjectionPreventionSettingsSection } from "../components/prompt-injection-prevention/PromptInjectionPreventionSettings";
import { t } from "@/i18n";

export function CompanyConnections() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { enabled } = useFastResponsesEnabled();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("upgrade1029NewPages.companyConnections.company"), href: "/dashboard" },
      { label: t("adapterTools.adapterManager.settings"), href: "/company/settings" },
      { label: t("appsBrowserGateway.connections.title") },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("upgrade1029NewPages.companyConnections.noOrganization")}
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center gap-2">
        <Link2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("appsBrowserGateway.connections.title")}</h1>
      </div>
      <DecisionModelSettingsSection key={selectedCompanyId} companyId={selectedCompanyId} />
      <div className="max-w-2xl border-t border-border pt-8">
        <PromptInjectionPreventionSettingsSection key={`injection-${selectedCompanyId}`} companyId={selectedCompanyId} />
      </div>
      {enabled && <div className="max-w-2xl border-t border-border pt-8">
        <FastResponseSettingsSection key={`fast-${selectedCompanyId}`} companyId={selectedCompanyId} />
      </div>}
    </div>
  );
}
