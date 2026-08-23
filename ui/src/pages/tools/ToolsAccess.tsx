import { useEffect } from "react";
import { Settings2, Wrench } from "lucide-react";
import { Link, Navigate, useParams } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { ProfilesIndex } from "./profiles/ProfilesIndex";
import { PoliciesTab } from "./PoliciesTab";
import { RuntimeTab } from "./RuntimeTab";
import { AuditTab } from "./AuditTab";
import { GatewaysTab } from "./GatewaysTab";
import { PasteConfigTab } from "./PasteConfigTab";
import { RunYourOwnTab } from "./RunYourOwnTab";
import { SmokeLabTab } from "./SmokeLabTab";
import { useTranslation } from "@/i18n";
import {
  ADVANCED_TABS,
  TOOL_TABS,
  advancedTabHref,
  isAdvancedSetupTab,
  type ToolTabKey,
} from "./tool-tabs";

function renderTab(tab: ToolTabKey, companyId: string) {
  switch (tab) {
    case "profiles":
      return <ProfilesIndex companyId={companyId} />;
    case "policies":
      return <PoliciesTab companyId={companyId} />;
    case "runtime":
      return <RuntimeTab companyId={companyId} />;
    case "audit":
      return <AuditTab companyId={companyId} />;
    case "gateways":
      return <GatewaysTab companyId={companyId} />;
    case "smoke-lab":
      return <SmokeLabTab companyId={companyId} />;
    case "paste-config":
      return <PasteConfigTab companyId={companyId} />;
    case "run-your-own":
    default:
      return <RunYourOwnTab companyId={companyId} />;
  }
}

export function ToolsAccess() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const params = useParams<{ tab?: string }>();
  const activeTab = (TOOL_TABS.find((t) => t.key === params.tab)?.key ?? "run-your-own") as ToolTabKey;
  const advanced = isAdvancedSetupTab(activeTab);
  const tabLabel = TOOL_TABS.find((t) => t.key === activeTab)?.label;

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: t("integrations.common.apps"), href: "/apps" },
      ...(advanced
        ? [{ label: t("integrations.tools.advancedSetup") }]
        : [
            { label: t("integrations.tools.advancedSetup"), href: advancedTabHref("run-your-own") },
            { label: tabLabel ?? t("integrations.tools.developerTools") },
          ]),
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, selectedCompany?.name, advanced, tabLabel]);

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("integrations.tools.selectCompany")}</div>;
  }

  // Retired developer tabs (PAP-10915/PAP-10928) — keep old links working.
  if (
    params.tab === "applications" ||
    params.tab === "connections" ||
    params.tab === "overview" ||
    params.tab === "examples"
  ) {
    return <Navigate to="/apps/connections" replace />;
  }

  if (advanced) {
    // M8a/M8b chrome (PAP-10839 wires): Advanced badge, plain-words subtitle,
    // and a two-tab switcher. The developer surface stays behind a quiet link.
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <header>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-foreground">{t("integrations.tools.advancedSetup")}</h1>
            <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-0.5 text-(length:--text-micro) font-bold text-background">
              {t("integrations.tools.advanced")}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integrations.tools.advancedDescription")}{" "}
            <Link to="/apps" className="font-medium text-primary hover:underline">
              connect it there instead
            </Link>
            .
          </p>
        </header>

        <nav className="flex items-center gap-6 border-b border-border">
          {ADVANCED_TABS.map((tab) => (
            <Link
              key={tab.key}
              to={advancedTabHref(tab.key)}
              className={cn(
                "-mb-px border-b-2 pb-2 text-sm transition-colors",
                tab.key === activeTab
                  ? "border-foreground font-bold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="min-h-(--sz-300px)">{renderTab(activeTab, selectedCompanyId)}</div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" />
          {t("integrations.tools.developerLink")}{" "}
          <Link to={advancedTabHref("profiles")} className="font-medium text-primary hover:underline">
            {t("integrations.tools.openDeveloperTools")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold text-foreground">{t("integrations.tools.developerTools")}</h1>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          {t("integrations.tools.developerDescription")}
        </p>
      </div>

      <div className="min-h-(--sz-300px)">{renderTab(activeTab, selectedCompanyId)}</div>
    </div>
  );
}
