import { useQuery } from "@tanstack/react-query";
import { Link, useCaseHref } from "@/lib/router";
import { casesApi, type CaseLinkRole } from "@/api/cases";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { queryKeys } from "@/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { useTranslation } from "@/i18n";


/**
 * Issue-page right-rail section (P4 §5): the cases linked to this issue, each
 * with its link role + case status. Self-gates on the experimental Cases flag
 * and renders nothing when the flag is off or no cases are linked, so it can be
 * dropped into the issue properties panel unconditionally.
 */
export function IssueCasesPanel({ issueId }: { issueId: string }) {
  const { t } = useTranslation();
  const caseHref = useCaseHref();
  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const enabled = experimentalSettings?.enableCases === true;

  const casesQuery = useQuery({
    queryKey: queryKeys.cases.forIssue(issueId),
    queryFn: () => casesApi.listForIssue(issueId),
    enabled: enabled && !!issueId,
  });

  const links = casesQuery.data ?? [];
  if (!enabled || links.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("operations.common.cases")}</h3>
      <div className="space-y-1">
        {links.map((link) => (
          <Link
            key={link.id}
            to={caseHref(link.case.identifier)}
            className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm transition-colors hover:bg-accent/50"
          >
            <span className="font-mono text-xs text-muted-foreground shrink-0">{link.case.identifier}</span>
            <span className="min-w-0 flex-1 truncate" title={link.case.title}>{link.case.title}</span>
            <Badge variant="secondary" className="shrink-0">{link.case.workIssueId === issueId ? t("upgrade1029ConflictsA.issueCases.workflow") : t(`casesExtra.roles.${link.role}`)}</Badge>
            {link.case.workIssueId === issueId && link.case.phase ? (
              <span className="truncate text-xs text-muted-foreground">{link.case.phase}</span>
            ) : null}
            <StatusBadge status={link.case.status} label={t(`casesExtra.status.${link.case.status}`)} />
          </Link>
        ))}
      </div>
    </section>
  );
}
