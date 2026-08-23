import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@/lib/router";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { queryKeys } from "@/lib/queryKeys";
import { useTranslation } from "@/i18n";

export function PipelinesExperimentalGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data: experimentalSettings, isFetched } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  if (!isFetched) return <span className="sr-only">{t("pipelinesExtra.gate.loading")}</span>;
  if (experimentalSettings?.enablePipelines !== true) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
