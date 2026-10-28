import type { AiConnectionRouterSelection } from "@paperclipai/shared";
import { t } from "@/i18n";

export function AiConnectionPoolRunDetails({ context }: { context: Record<string, unknown> | null }) {
  const selection = context?.aiRouterSelection as AiConnectionRouterSelection | undefined;
  if (!selection) return null;
  const account = context?.aiConnection as { accountName?: string; connectionId?: string } | undefined;
  const config = selection.runtimeConfig;
  const effort = config.modelReasoningEffort ?? config.reasoningEffort ?? config.effort ?? config.variant;
  return <div className="rounded-lg border p-4 text-sm space-y-1">
    <p className="font-medium">{t("upgrade1029NewComponents.aiConnectionPoolRunDetails.pinnedAccount", { name: account?.accountName ?? account?.connectionId ?? t("upgrade1029NewComponents.aiConnectionPoolRunDetails.selectedAccount") })}</p>
    <p>{[selection.binding.provider, config.provider, config.acpxAgent, config.model, effort].filter(Boolean).map(String).join(" · ")}</p>
    {selection.notes.length > 0 && <p className="text-muted-foreground">{selection.notes.join(" ")}</p>}
  </div>;
}
