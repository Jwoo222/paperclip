import { useQuery } from "@tanstack/react-query";
import { grokBotApi } from "@/api/grokBot";
import { Link } from "@/lib/router";
import { t } from "@/i18n";
/** Reports observed Paperclip activity; this is not a provider availability indicator. */
export function GrokBotWorkSummary({ companyId, agentId }: { companyId: string; agentId: string }) {
  const state = useQuery({ queryKey: ["grok-binding", companyId, agentId], queryFn: ({ signal }) => grokBotApi.connection(companyId, agentId, signal), retry: false, refetchInterval: 10000 });
  const data = state.data, binding = data?.binding, routine = binding?.routine;
  return <div className="space-y-2 text-sm">
    {state.error && <p role="alert" className="text-destructive">{t("upgrade1029NewComponents.grokBotWorkSummary.refreshFailed", { error: state.error.message })}</p>}
    <p>{data?.recoveryNeeded ? t("upgrade1029NewComponents.grokBotConnection.recoveryNeeded") : binding?.assignment?.status === "offered" ? t("upgrade1029NewComponents.grokBotConnection.awaitingAcknowledgement") : binding?.assignment ? t("upgrade1029NewComponents.grokBotWorkSummary.workingInGrokBot") : routine?.verified ? t("upgrade1029NewComponents.grokBotWorkSummary.noActiveSession") : t("upgrade1029NewComponents.grokBotWorkSummary.setupIncomplete")}</p>
    {data?.currentTask && <Link className="underline" to={`/issues/${data.currentTask.id}`}>{data.currentTask.identifier}: {data.currentTask.title}</Link>}
    <p className="text-muted-foreground">{t("upgrade1029NewComponents.grokBotWorkSummary.queuedTasks", { value: data?.queuedTaskCount ?? t("upgrade1029NewComponents.grokBotWorkSummary.checking") })}</p>
    <p className="text-muted-foreground">{t("upgrade1029NewComponents.grokBotWorkSummary.lastContact", { time: routine?.lastContactAt ? new Date(routine.lastContactAt).toLocaleString() : t("upgrade1029NewComponents.grokBotWorkSummary.notObserved") })}</p>
    <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.grokBotWorkSummary.activityNote")}</p>
  </div>;
}
