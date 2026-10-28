import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { heartbeatsApi } from "@/api/heartbeats";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiConnectionsApi } from "@/api/ai-connections";
import { toolsApi } from "@/api/tools";
import { useNavigate } from "@/lib/router";
import { AiConnectionAccountControls } from "./AiConnectionAccountControls";
import { AiConnectionUsagePanel } from "./AiConnectionUsagePanel";
import type { ToolConnection, AiConnectionMetadata } from "@paperclipai/shared";
import { aiMethodLabel } from "./model";

export function ManagedAiConnectionRow({
  connection,
}: {
  connection: ToolConnection;
}) {
  const metadata = connection.config?.ai as AiConnectionMetadata | undefined;
  if (!metadata) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {metadata.routing ? metadata.routing.kind === "bedrock" ? `Bedrock · ${metadata.routing.region}` : metadata.routing.kind === "openrouter" ? "OpenRouter" : metadata.routing.baseUrl : aiMethodLabel(metadata.provider, metadata.method)} ·{" "}
      {connection.credentialPolicy === "per_user"
        ? tNewUi("newUi.k845f9286400f")
        : tNewUi("newUi.k47e5dc161731")}
    </p>
  );
}
export function ManagedAiConnectionDetails({
  connection,
}: {
  connection: ToolConnection;
}) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const runs = useQuery({
    queryKey: ["ai-connection-active-runs", connection.id],
    queryFn: () =>
      aiConnectionsApi.activeRuns(connection.companyId, connection.id),
  });
  const accounts = useQuery({
    queryKey: ["ai-connections", connection.companyId],
    queryFn: () => aiConnectionsApi.list(connection.companyId),
  });
  const grants = useQuery({
    queryKey: ["ai-connection-grants", connection.id],
    queryFn: () => toolsApi.listConnectionGrants(connection.id),
  });
  const refresh = () => client.invalidateQueries();
  const makeDefault = useMutation({
    mutationFn: (id: string) =>
      aiConnectionsApi.setDefault(connection.companyId, id),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      toolsApi.revokeConnectionGrant(connection.id, id),
    onSuccess: refresh,
  });
  const stop = useMutation({
    mutationFn: (id: string) => heartbeatsApi.cancel(id),
    onSuccess: refresh,
  });
  const account = accounts.data?.connections.find(
    (a) => a.id === connection.id,
  );
  const grant = grants.data?.grants.find((g) => g.id === account?.grantId);
  const error =
    accounts.error ??
    grants.error ??
    makeDefault.error ??
    stop.error;
  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {error.message}
      </p>
    );
  if (!account || !grant)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {accounts.isPending || grants.isPending
          ? tNewUi("newUi.k91a8f47709a5")
          : tNewUi("newUi.k407f13fa09d3")}
      </p>
    );
  return (
    <div className="space-y-4">
      {account.routing && <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium">{tNewUi("upgrade1029AutoMerged.managedAiConnection.providerSettings")}</summary><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><dt className="text-muted-foreground">{tNewUi("upgrade1029AutoMerged.managedAiConnection.destination")}</dt><dd className="break-all">{account.routing.baseUrl ?? (account.routing.kind === "bedrock" ? account.routing.region : "OpenRouter")}</dd><dt className="text-muted-foreground">{tNewUi("upgrade1029AutoMerged.managedAiConnection.apiFormat")}</dt><dd>{account.routing.kind === "openrouter" ? tNewUi("upgrade1029AutoMerged.managedAiConnection.selectedByHarness") : account.routing.protocol}</dd><dt className="text-muted-foreground">{tNewUi("newUi.k66880d2d8216")}</dt><dd>{account.routing.auth}</dd><dt className="text-muted-foreground">{tNewUi("upgrade2610Task.models")}</dt><dd>{account.routing.models.map(m => m.label ?? m.id).join(", ") || tNewUi("upgrade1029AutoMerged.managedAiConnection.enterModelId")}</dd></dl></details>}
      <AiConnectionAccountControls
        account={account}
        grant={grant}
        currentUserId={accounts.data!.currentUserId}
        onMakeDefault={() => makeDefault.mutate(grant.id)}
        onRevoke={() => revoke.mutateAsync(grant.id).then(() => undefined)}
        revocationDetails={
          <div className="space-y-2">
            {runs.error && (
              <p role="alert">
                {tNewUi("newUi.k2404295f0356")}
              </p>
            )}
            {runs.data?.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {run.agentName} · {run.status}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={stop.isPending}
                  onClick={() => stop.mutate(run.id)}
                >
                  {t("chatUiExtra.stopRun")}
                </Button>
              </div>
            ))}
          </div>
        }
        onReconnect={() =>
          navigate(
            `/apps/connect?source=${account.provider}&reconnect=${connection.id}&method=ai-${account.method}`,
          )
        }
      />
      <AiConnectionUsagePanel key={`${account.id}:${account.grantId}:${account.status}`} account={account} />
    </div>
  );
}
