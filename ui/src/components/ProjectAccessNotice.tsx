import { t } from "@/i18n";
import { ShieldCheck, ShieldX, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

export interface ProjectAccessNoticeProps {
  agentName?: string;
  projectName?: string;
  ready: boolean;
  canManage: boolean;
  canRetry: boolean;
  onManage: () => void;
  onRetry: () => void;
  error?: Error | null;
  className?: string;
}

export function ProjectAccessNotice({ agentName: agentNameProp, projectName, ready, canManage, canRetry, onManage, onRetry, error, className }: ProjectAccessNoticeProps) {
  const agentName = agentNameProp ?? t("upgrade1029NewComponents.projectAccessNotice.thisAgent");
  return <section role={ready ? "status" : "alert"} aria-label={t("upgrade1029NewComponents.projectAccessNotice.projectAccess")} className={cn("space-y-4 rounded-lg border border-border p-4", className)}>
    <div className="flex items-start gap-3">
      {ready ? <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden /> : <ShieldX className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />}
      <div className="min-w-0 space-y-2">
        <h3 className="text-sm font-semibold">{ready ? t("upgrade1029NewComponents.projectAccessNotice.ready") : t("upgrade1029NewComponents.projectAccessNotice.cannotAccess", { agentName })}</h3>
        <p className="text-sm text-muted-foreground">{ready
          ? t("upgrade1029NewComponents.projectAccessNotice.readyDescription")
          : t("upgrade1029NewComponents.projectAccessNotice.needsProject", { projectName: projectName ?? t("upgrade1029NewComponents.projectAccessNotice.aProject") })}</p>
        {!ready && !canManage && <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.projectAccessNotice.askManager")}</p>}
      </div>
    </div>
    <div className="flex flex-wrap gap-2 pl-8">
      {ready ? canRetry && <Button size="sm" onClick={onRetry}>{t("upgrade1029NewComponents.projectAccessNotice.retryTask")}<ArrowRight className="size-4" aria-hidden /></Button>
        : <Button size="sm" variant="outline" onClick={onManage}>{canManage ? t("upgrade1029NewComponents.projectAccessNotice.manageProjectAccess") : t("upgrade1029NewComponents.projectAccessNotice.viewAgentAccess")}<ArrowRight className="size-4" aria-hidden /></Button>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
    {!ready && <details className="pl-8 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("upgrade1029NewComponents.projectAccessNotice.runDetails")}</summary>
      <dl className="mt-3 grid grid-cols-2 gap-2"><dt>{t("upgrade1029NewComponents.projectAccessNotice.stoppedDuring")}</dt><dd>{t("upgrade1029NewComponents.projectAccessNotice.workspaceSetup")}</dd><dt>{t("issueRecovery.reason")}</dt><dd>{t("upgrade1029NewComponents.projectAccessNotice.outsideScope")}</dd><dt>{t("upgrade1029NewComponents.projectAccessNotice.providerStarted")}</dt><dd>{t("appsConnect.common.no")}</dd></dl>
    </details>}
  </section>;
}
