import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Wrench } from "lucide-react";
import { companySkillsApi } from "@/api/companySkills";
import { MarkdownBody } from "@/components/MarkdownBody";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryKeys";
import { useNavigate } from "@/lib/router";
import { parseFrontmatterMarkdown } from "@paperclipai/shared";

export function TaskSkillPanel({ companyId, skillId }: { companyId: string; skillId: string }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.companySkills.detail(companyId, skillId),
    queryFn: () => companySkillsApi.detail(companyId, skillId),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  const view = useQueryView(query);
  if (query.isLoading || view.kind === "reconnecting") {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("skillStudio.loadingSkill")}
      </div>
    );
  }
  if (view.kind === "error") {
    if (view.errorKind === "not_found") {
      return <div className="py-8 text-sm text-muted-foreground" role="status">{tNewUi("newUi.kf266c3fde7c5")}</div>;
    }
    if (view.errorKind === "forbidden") {
      return <div className="py-8 text-sm text-muted-foreground" role="alert">{tNewUi("newUi.kcc90e7ec78bd")}</div>;
    }
    return (
      <div className="py-6">
        <QueryErrorState error={query.error} action="load the skill" onRetry={view.retry} retrying={view.isFetching} />
      </div>
    );
  }
  if (!query.data) {
    return <div className="py-8 text-sm text-muted-foreground" role="status">{tNewUi("newUi.kf266c3fde7c5")}</div>;
  }
  const skill = query.data;
  const previewMarkdown = parseFrontmatterMarkdown(skill.markdown).body;
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">{skill.name}</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/skills/studio/${encodeURIComponent(skill.id)}`)}
          >
            <ExternalLink className="mr-1.5 size-3.5" aria-hidden />
            {tNewUi("newUi.k90ec3b0d0d07")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {skill.slug} · {skill.currentVersion ? `Revision ${skill.currentVersion.revisionNumber}` : tNewUi("newUi.ka74487de8969")}
        </p>
      </header>
      {skill.description ? <p className="text-sm text-muted-foreground">{skill.description}</p> : null}
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FileText className="size-3.5" aria-hidden />
          {tNewUi("newUi.kf9f4685609f8")}
        </h3>
        <MarkdownBody>{previewMarkdown || tNewUi("newUi.k427e00bb362a")}</MarkdownBody>
      </section>
    </article>
  );
}
