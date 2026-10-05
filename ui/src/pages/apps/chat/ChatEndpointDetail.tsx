import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { SlackToolsSettings, SlackSearchAccess } from "./SlackToolSettings";
import { defaultSlackAppName } from "./slack-app-name";
import { ChatCommunicationInstructions } from "./ChatCommunicationInstructions";
import { SlackAvatarSettings } from "./SlackAvatarStep";
import { agentsApi } from "@/api/agents";
import { agentAvatarUrl } from "@/lib/agent-avatar-url";
import { resolveAgentAppearance } from "@paperclipai/shared";
import { GitHubBotManagement, GitHubReviews } from "./GitHubBotManagement";
import { EmailEndpointSettings } from "./EmailEndpointSetup";
import { EmailConnectionAccess } from "@/components/EmailConnectionAccess";
import { emailApi } from "@/api/email";
import { toolsApi } from "@/api/tools";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Check,
  Activity as ActivityIcon,
  Copy,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  chatEndpointsApi,
  type ChatActivityItem,
  type ChatEndpoint,
  type ChatEndpointResource,
  type ChatProvider,
} from "@/api/chatEndpoints";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { AppLogo } from "../AppLogo";
import { StatusBadge } from "@/components/StatusBadge";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { formatDateTime } from "@/lib/utils";
import { queryKeys } from "@/lib/queryKeys";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Link, Navigate, useNavigate, useParams } from "@/lib/router";

const tabs = ["settings", "access", "reviews", "conversations", "activity"] as const;
type ChatTab = (typeof tabs)[number];
const tabItems = tabs.map((value) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
}));
const providerNames: Record<ChatProvider, string> = {
  agentmail: "AgentMail",
  slack: "Slack",
  github: "GitHub",
  discord: "Discord",
  "microsoft-teams": "Microsoft Teams",
  telegram: "Telegram",
  "imessage-photon": "iMessage Photon",
};

const providerLifecycleGuidance: Record<
  ChatProvider,
  { reconnect: string; remove: string }
> = {
  agentmail: { reconnect: tNewUi("newUi.k1b5cb9317d00"), remove: tNewUi("newUi.ke12c70aff11f") },
  slack: {
    reconnect:
      tNewUi("newUi.k60f6b3febf26"),
    remove:
      tNewUi("newUi.kce21d4abc98a"),
  },
  github: {
    reconnect:
      tNewUi("newUi.k8855f9d5e386"),
    remove:
      tNewUi("newUi.kcbccc0f0a167"),
  },
  discord: {
    reconnect:
      tNewUi("newUi.k3d62edeb40a0"),
    remove:
      tNewUi("newUi.k1dd66422dfce"),
  },
  "microsoft-teams": {
    reconnect:
      tNewUi("newUi.k9b637a1ad9b8"),
    remove:
      tNewUi("newUi.k080f282e2be5"),
  },
  "imessage-photon": {
    reconnect: tNewUi("newUi.ke16085afce46"),
    remove: tNewUi("newUi.k08283dcf17c4"),
  },
  telegram: {
    reconnect:
      tNewUi("newUi.ke3463e7ca718"),
    remove:
      tNewUi("newUi.kad5c6e8140b8"),
  },
};

const activityKindLabels: Record<ChatActivityItem["kind"], string> = {
  delivery: tNewUi("newUi.k9ac4ff229cd4"),
  publication: tNewUi("newUi.k8dcc69d57992"),
  action: tNewUi("newUi.k58176e7e355f"),
  health: tNewUi("newUi.k883d0e5c0f87"),
  repair: tNewUi("newUi.k2c777c5f586f"),
};

const replayableFailureStates = new Set(["failed"]);
// Provider callbacks do not necessarily emit a Board activity event. Refresh
// only mounted operational views, and stop polling when the browser is hidden.
const liveChatQueryOptions = {
  staleTime: 0,
  refetchInterval: 5_000,
  refetchIntervalInBackground: false,
} as const;

export function isReplayEligible(item: ChatActivityItem): boolean {
  if (
    item.fileTransfer ||
    !item.replayable ||
    !replayableFailureStates.has(item.status)
  ) {
    return false;
  }
  if (item.kind === "delivery") return item.status === "failed";
  return item.kind === "publication";
}

export function activityResolutionActions(item: ChatActivityItem) {
  const offered = item.resolutionActions ?? [];
  if (!item.fileTransfer) return offered;
  if (
    item.kind !== "publication" ||
    !Number.isSafeInteger(item.fileTransfer.version) ||
    item.fileTransfer.version < 1
  )
    return [];
  if (
    ![
      "consent_unknown",
      "upload_unknown",
      "file_info_unknown",
      "conflict",
    ].includes(item.fileTransfer.phase)
  )
    return [];
  // Only the file-info stage can use ordinary visible-delivery resolution.
  // Earlier consent/upload evidence must not be fabricated by these buttons.
  return item.fileTransfer.phase === "file_info_unknown"
    ? offered
    : offered.filter((action) => action === "cancel");
}

export function activityResolutionDescription(item: ChatActivityItem): string {
  const phase = item.fileTransfer?.phase;
  if (phase === "file_info_unknown")
    return tNewUi("newUi.kcf8db3000eb5");
  if (phase === "consent_unknown")
    return tNewUi("newUi.k267408f13ce0");
  if (phase)
    return tNewUi("newUi.kb4025bda5805");
  return tNewUi("newUi.k1a7e11bb011c");
}

export function isResolutionEligible(item: ChatActivityItem): boolean {
  return (
    (item.kind === "publication" || item.kind === "action") &&
    item.status === "delivery_unknown" &&
    activityResolutionActions(item).length > 0
  );
}

export function isIndividuallyToggleableResource(
  provider: ChatProvider,
  resourceType: string,
): boolean {
  return !(
    provider === "microsoft-teams" &&
    (resourceType === "direct_message" || resourceType === "group_chat")
  );
}

function activityDetailLabel(item: ChatActivityItem): string {
  return replayableFailureStates.has(item.status) ? tNewUi("newUi.kf81ab834de5f") : tNewUi("newUi.k45989de49fb7");
}

export function connectionHealthPresentation(
  endpoint: Pick<ChatEndpoint, "status" | "healthMessage" | "lastError">,
) {
  // Health events outlive pause/removal. They are history, not lifecycle state.
  const lifecycleMessages = {
    draft: tNewUi("newUi.k59e83bf1d737"),
    verifying: tNewUi("newUi.k7e9914b53b59"),
    paused: tNewUi("newUi.k7f7bd7bb584a"),
    attention: tNewUi("newUi.k642533f847ec"),
    revoked: tNewUi("newUi.ka03c4512aa76"),
    archived: tNewUi("newUi.k6a5560db86de"),
  };
  const lifecycleMessage =
    endpoint.status === "active" ? null : lifecycleMessages[endpoint.status];
  return {
    message: lifecycleMessage ?? endpoint.healthMessage ?? null,
    previousHealth: lifecycleMessage ? (endpoint.healthMessage ?? null) : null,
    error: endpoint.lastError ?? null,
    errorLabel: ["active", "attention", "revoked"].includes(endpoint.status)
      ? tNewUi("newUi.kf81ab834de5f")
      : tNewUi("newUi.kcded008bae6e"),
  };
}

export function ChatEndpointDetail() {
  const { endpointId = "", tab = "settings" } = useParams<{
    endpointId: string;
    tab?: string;
  }>();
  const activeTab = tabs.includes(tab as ChatTab) ? (tab as ChatTab) : null;
  const navigate = useNavigate();
  const { setBreadcrumbs } = useBreadcrumbs();
  const endpointQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.detail(endpointId),
    queryFn: () => chatEndpointsApi.get(endpointId),
    enabled: Boolean(endpointId && activeTab),
    ...liveChatQueryOptions,
    refetchInterval:
      activeTab === "activity" || activeTab === "conversations"
        ? liveChatQueryOptions.refetchInterval
        : false,
  });
  const endpoint = endpointQuery.data;
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!endpoint || !activeTab) return;
    setBreadcrumbs([
      { label: tNewUi("newUi.kc3d2e79ebdd0"), href: "/apps" },
      {
        label: `${endpoint.assignedAgentName} · ${providerNames[endpoint.provider]}`,
        href: `/apps/chat/${endpoint.id}/settings`,
      },
      {
        label:
          tabItems.find((item) => item.value === activeTab)?.label ??
          tNewUi("newUi.k74a883a037bc"),
      },
    ]);
    return () => setBreadcrumbs([]);
  }, [activeTab, endpoint, setBreadcrumbs]);

  if (!activeTab)
    return <Navigate replace to={`/apps/chat/${endpointId}/settings`} />;
  if (endpointQuery.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tNewUi("newUi.kca5b56e4cc0b")}
      </div>
    );
  if (endpointQuery.isError || !endpoint)
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          {tNewUi("newUi.k89a518fffbb4")}
        </p>
        <Button variant="outline" onClick={() => endpointQuery.refetch()}>
          {tNewUi("newUi.kd8b8392e2c54")}
        </Button>
      </div>
    );
  if (endpoint.provider === "agentmail" && activeTab === "settings")
    return <EmailEndpointSettings key={endpoint.id} endpointId={endpoint.id} companyId={endpoint.companyId} assignedAgentName={endpoint.assignedAgentName} />;
  const setupIncomplete =
    endpoint.setup?.step !== "complete" &&
    ["draft", "verifying", "attention", "revoked"].includes(endpoint.status);

  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">
            {endpoint.assignedAgentName} {tNewUi("newUi.k582967534d0f")} {providerNames[endpoint.provider]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {endpoint.providerAccountLabel ?? (endpoint.provider === "agentmail" ? endpoint.botExternalId ?? "Email connection" : tNewUi("newUi.kc3b314eca2b0"))}
          </p>
          {endpoint.provider === "imessage-photon" && endpoint.botExternalId && endpoint.photonAllocation !== "shared" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span>{endpoint.botExternalId}</span>
              <Button variant="ghost" size="sm" aria-label={tNewUi("newUi.k0a559caf8e5e")} onClick={async () => {
                try { await copyTextToClipboard(endpoint.botExternalId!); setCopyStatus(tNewUi("newUi.k4bf3f054bc40")); }
                catch { setCopyStatus(tNewUi("newUi.k89546dec5c35")); }
              }}><Copy className="size-4" />{tNewUi("newUi.kf35c40de4435")}</Button>
              <span role="status" className="text-muted-foreground">{copyStatus}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {setupIncomplete ? (
            <Button
              variant="outline"
              onClick={() =>
                navigate(
                  `/apps/chat/connect?provider=${endpoint.provider}&purpose=chat&resume=${endpoint.id}`,
                )
              }
            >
              {tNewUi("newUi.kc5702c19da53")}
            </Button>
          ) : null}
          {endpoint.status !== "active" && <StatusBadge status={endpoint.status} />}
        </div>
      </header>
      {activeTab === "settings" && (
        <>
{endpoint.provider === "github" && <GitHubBotManagement endpoint={endpoint} view="settings" />}
{endpoint.provider !== "github" && <Settings endpointId={endpoint.id} endpoint={endpoint} />}
</>
      )}
      {activeTab === "reviews" && endpoint.provider === "github" && <GitHubReviews endpointId={endpoint.id} />}
{activeTab === "access" && endpoint.provider === "github" && <GitHubBotManagement endpoint={endpoint} view="access" />}
{activeTab === "access" && endpoint.provider === "agentmail" && <EmailAccess endpoint={endpoint} />}
{activeTab === "access" && endpoint.provider !== "github" && endpoint.provider !== "agentmail" && (
        <Access
          endpointId={endpoint.id}
          allowUnlinked={endpoint.allowUnlinkedPeople}
          endpoint={endpoint}
        />
      )}
      {activeTab === "conversations" && (
        <Conversations endpointId={endpoint.id} provider={endpoint.provider} />
      )}
      {activeTab === "activity" && (
        <Activity endpointId={endpoint.id} endpoint={endpoint} />
      )}
    </div>
  );
}

function EmailAccess({ endpoint }: { endpoint: ChatEndpoint }) {
  const connection = useQuery({
    queryKey: queryKeys.tools.connection(endpoint.connectionId ?? ""),
    queryFn: () => toolsApi.getConnection(endpoint.connectionId!),
    enabled: Boolean(endpoint.connectionId),
  });
  const agents = useQuery({
    queryKey: queryKeys.agents.list(endpoint.companyId),
    queryFn: () => agentsApi.list(endpoint.companyId),
  });
  if (!endpoint.connectionId || agents.isError || connection.isError) return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">Connection access could not be loaded.</p>
      <Button variant="outline" onClick={() => { void agents.refetch(); void connection.refetch(); }}>Try again</Button>
    </div>
  );
  if (agents.isPending || connection.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading access…</p>;
  const sourceId = connection.data.config?.credentialConnectionId;
  const credentialId = typeof sourceId === "string" ? sourceId : endpoint.connectionId;
  return <section className="max-w-3xl space-y-4">
    <h2 className="text-lg font-semibold">Access</h2>
    {credentialId !== endpoint.connectionId && <p className="text-sm text-muted-foreground">These settings apply to the saved AgentMail account and all inboxes using it.</p>}
    <EmailConnectionAccess key={credentialId} companyId={endpoint.companyId} connectionId={credentialId} agents={agents.data} />
  </section>;
}

function Settings({
  endpointId,
  endpoint,
}: {
  endpointId: string;
  endpoint: Awaited<ReturnType<typeof chatEndpointsApi.get>>;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [messageCopied, setMessageCopied] = useState(false);
  const avatarAgent = useQuery({
    queryKey: queryKeys.agents.detail(endpoint.assignedAgentId),
    queryFn: () => agentsApi.get(endpoint.assignedAgentId, endpoint.companyId),
    enabled: endpoint.provider === "slack",
  });
  const mentionMessage = `@${(endpoint.botUsername ?? endpoint.botLabel ?? endpoint.assignedAgentName).replace(/^@/, "")} you there?`;
  const resourcesQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.resources(endpointId),
    queryFn: () => chatEndpointsApi.listResources(endpointId),
  });
  const saveResources = useMutation({
    mutationFn: (resource: Pick<ChatEndpointResource, "id" | "enabled">) =>
      chatEndpointsApi.updateResources(endpointId, [resource]),
    onSuccess: (resources) =>
      queryClient.setQueryData(
        queryKeys.chatEndpoints.resources(endpointId),
        resources,
      ),
    onError: (error) =>
      pushToast({
        title: tNewUi("newUi.kf23b38cd6e08"),
        body: error instanceof Error ? error.message : tNewUi("newUi.ka0c2cc1374d9"),
        tone: "error",
      }),
  });
  const updateEndpoint = useMutation({
    mutationFn: chatEndpointsApi.update.bind(null, endpointId),
    onSuccess: (next) =>
      queryClient.setQueryData(
        queryKeys.chatEndpoints.detail(endpointId),
        next,
      ),
    onError: (error) =>
      pushToast({
        title: tNewUi("newUi.k522457dbff20"),
        body: error instanceof Error ? error.message : tNewUi("newUi.ka0c2cc1374d9"),
        tone: "error",
      }),
  });
  const resources = resourcesQuery.data ?? [];
  const destinationResources = resources.filter((resource) =>
    isIndividuallyToggleableResource(endpoint.provider, resource.type),
  );
  const toggleResource = (resource: ChatEndpointResource, enabled: boolean) =>
    // A cached inventory must not overwrite another operator's unrelated edits.
    saveResources.mutate({ id: resource.id, enabled });
  return (
    <section className="max-w-3xl space-y-7">
      {endpoint.provider === "imessage-photon" && <p className="text-sm text-muted-foreground">{endpoint.photonAllocation === "shared" ? tNewUi("newUi.kbdbec108665c") : tNewUi("newUi.kade4297c0b4f")}</p>}
      {endpoint.provider === "slack" && (
        <div className="space-y-2 text-sm">
          <h2 className="text-lg font-semibold">{tNewUi("newUi.k4d7c0afaf53e")}</h2>
          <p>{tNewUi("newUi.kec7e38b6fec4")}</p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <code>{mentionMessage}</code>
            <Button size="icon" variant="ghost" aria-label={messageCopied ? tNewUi("newUi.ked112278453f") : tNewUi("newUi.k457efe538b25")} onClick={() => {
              void copyTextToClipboard(mentionMessage).then(() => setMessageCopied(true), () => pushToast({ title: tNewUi("newUi.k31ae078543c9"), body: tNewUi("newUi.k0edc1f0c401d"), tone: "error" }));
            }}>{messageCopied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button>
          </div>
        </div>
      )}
      {endpoint.provider === "slack" && (
        avatarAgent.isPending ? <p role="status" className="text-sm text-muted-foreground">{tNewUi("newUi.k0a92b68354ac")}</p>
          : avatarAgent.isError ? <p role="alert" className="text-sm text-destructive">{tNewUi("newUi.k984c743c4683")} <button className="underline" onClick={() => void avatarAgent.refetch()}>{tNewUi("newUi.kd8b8392e2c54")}</button></p>
          : <SlackAvatarSettings
              agentName={avatarAgent.data?.name ?? endpoint.assignedAgentName}
              appName={endpoint.setup?.slackApp?.appName ?? defaultSlackAppName(avatarAgent.data?.name ?? endpoint.assignedAgentName)}
              avatarUrl={agentAvatarUrl(resolveAgentAppearance(avatarAgent.data?.appearance, endpoint.assignedAgentId), 512, 1, "rest")}
            />
      )}
      {endpoint.provider === "slack" && <SlackToolsSettings companyId={endpoint.companyId} endpointId={endpointId} connectionId={endpoint.connectionId} />}
      {endpoint.provider === "slack" && <ChatCommunicationInstructions
        key={endpoint.id}
        value={endpoint.communicationInstructions ?? ""}
        onSave={async (communicationInstructions) => {
          const next = await chatEndpointsApi.update(endpointId, { communicationInstructions });
          queryClient.setQueryData(queryKeys.chatEndpoints.detail(endpointId), next);
        }}
      />}
      {endpoint.provider === "telegram" && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{tNewUi("newUi.ka2c515a4d168")}</h2>
          <div className="rounded-lg border border-border p-3 text-sm">
            <code>
              /task@
              {endpoint.botUsername?.replace(/^@/, "") ?? "bot_username"}{" "}
              &lt;request&gt;
            </code>
            <p className="mt-2 text-muted-foreground">
              {tNewUi("newUi.kb372c3ed6fde")}
            </p>
          </div>
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold">{tNewUi("newUi.kb3257820dbf0")}</h2>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{endpoint.provider === "slack" ? tNewUi("newUi.ke57f04d75c1b") : tNewUi("newUi.k72eb63f032e4")}</h3>
        {resourcesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{tNewUi("newUi.kb78eda5f3fc7")}</p>
        ) : destinationResources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {tNewUi("newUi.k44663dffe955")}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {destinationResources.map((resource) => (
              <div key={resource.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {resource.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {resource.availability === "available"
                      ? (resource.detail ?? resource.type)
                      : tNewUi("newUi.kb0c0c15c2d57")}
                  </p>
                  {resource.participants?.length ? <p className="mt-1 break-words text-xs text-muted-foreground">{tNewUi("newUi.k92ac4b95326e")} {resource.participants.join(", ")}</p> : null}
                </div>
                <ToggleSwitch
                  aria-label={`Enable ${resource.label}`}
                  checked={resource.enabled}
                  disabled={
                    endpoint.photonAllocation === "shared" ||
                    resource.availability !== "available" ||
                    saveResources.isPending
                  }
                  onCheckedChange={(enabled) =>
                    toggleResource(resource, enabled)
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {endpoint.provider !== "github" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{tNewUi("newUi.k65f20ef7ee9a")}</h3>
          <SettingToggle
            label={tNewUi("newUi.ke2f7f14dd8ad")}
            detail={
              endpoint.provider === "discord"
                ? tNewUi("newUi.kf78465c5a684")
                : tNewUi("newUi.k4464bb789286")
            }
            checked={endpoint.allowDirectMessages ?? false}
            pending={updateEndpoint.isPending}
            onChange={(allowDirectMessages) =>
              updateEndpoint.mutate({ allowDirectMessages })
            }
          />
          {endpoint.provider === "microsoft-teams" && (
            <SettingToggle
              label={tNewUi("newUi.k5fabb08f65b4")}
              detail={tNewUi("newUi.ka815e4ffb115")}
              checked={endpoint.allowGroupChats ?? false}
              pending={updateEndpoint.isPending}
              onChange={(allowGroupChats) =>
                updateEndpoint.mutate({ allowGroupChats })
              }
            />
          )}
        </div>
      )}
    </section>
  );
}

function SettingToggle({
  label,
  detail,
  checked,
  pending,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-y border-border py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <ToggleSwitch
        aria-label={label}
        checked={checked}
        disabled={pending}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function Access({
  endpointId,
  allowUnlinked,
  endpoint,
}: {
  endpointId: string;
  allowUnlinked: boolean;
  endpoint: ChatEndpoint;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [confirmationUrl, setConfirmationUrl] = useState<string | null>(null);
  const [joinCommandCopied, setJoinCommandCopied] = useState(false);
  const joinCommand = `${endpoint.setup?.slackApp?.command ?? endpoint.setup?.command ?? "/paperclip"} connect`;
  const linksQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.principals(endpointId),
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
  });
  const updatePolicy = useMutation({
    mutationFn: (value: boolean) =>
      chatEndpointsApi.update(endpointId, { allowUnlinkedPeople: value }),
    onSuccess: (next) =>
      queryClient.setQueryData(
        queryKeys.chatEndpoints.detail(endpointId),
        next,
      ),
    onError: (error) => pushToast({ title: tNewUi("newUi.k14797075c7b8"), body: error instanceof Error ? error.message : tNewUi("newUi.ka0c2cc1374d9"), tone: "error" }),
  });
  const createIntent = useMutation({
    mutationFn: (principalId: string) =>
      chatEndpointsApi.createLinkIntent(endpointId, principalId),
    onSuccess: ({ confirmationUrl }) => {
      setConfirmationUrl(
        new URL(confirmationUrl, window.location.origin).toString(),
      );
      pushToast({
        title: tNewUi("newUi.kec92b406a21c"),
        body: tNewUi("newUi.kc0b6f302dc8d"),
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: tNewUi("newUi.k619b3ffebb37"),
        body: error instanceof Error ? error.message : tNewUi("newUi.ka0c2cc1374d9"),
        tone: "error",
      }),
  });
  const revoke = useMutation({
    mutationFn: (principalId: string) =>
      chatEndpointsApi.revokeLink(endpointId, principalId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.principals(endpointId),
      }),
  });
  const links = linksQuery.data ?? [];
  return (
    <section className="max-w-3xl space-y-7">
      <div>
        <h2 className="text-lg font-semibold">{tNewUi("newUi.k742bdfc379f8")}</h2>
      </div>
      {endpoint.provider === "slack" && <SlackSearchAccess companyId={endpoint.companyId} endpointId={endpointId} />}
      {endpoint.provider === "slack" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{tNewUi("newUi.ka7e7666699d0")}</h3>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              {tNewUi("newUi.k7fb4fb01bdc0")}
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <code>{joinCommand}</code>
                <Button size="sm" variant="ghost" onClick={() => {
                  void copyTextToClipboard(joinCommand).then(() => setJoinCommandCopied(true), () => pushToast({ title: tNewUi("newUi.kf3a00b9a8633"), body: tNewUi("newUi.k0edc1f0c401d"), tone: "error" }));
                }}><Copy className="size-4" />{joinCommandCopied ? tNewUi("newUi.k8d525e5f158b") : tNewUi("newUi.k9a01feecae67")}</Button>
              </div>
            </li>
            <li>{tNewUi("newUi.k16dc3980b69c")}</li>
            <li>{tNewUi("newUi.kbb882d5f32d6")} <strong>{tNewUi("newUi.kb06f1662da4a")}</strong>{tNewUi("newUi.k3ad41e9225c8")}</li>
          </ol>
          <p className="text-sm text-muted-foreground">{tNewUi("newUi.k3bc0efc6b09e")}</p>
        </div>
      )}
      <SettingToggle
        label={tNewUi("newUi.kb61e32fc710b")}
        detail={tNewUi("newUi.k89e4d44d213e")}
        checked={allowUnlinked}
        pending={updatePolicy.isPending}
        onChange={(value) => updatePolicy.mutate(value)}
      />
      {confirmationUrl && (
        <div className="space-y-2 border-y border-border py-3">
          <p className="text-sm font-medium">{tNewUi("newUi.ka3503780b09e")}</p>
          <p className="break-all text-xs text-muted-foreground">
            {confirmationUrl}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void copyTextToClipboard(confirmationUrl).then(
                () =>
                  pushToast({
                    title: tNewUi("newUi.k715f61114670"),
                    tone: "success",
                  }),
                () =>
                  pushToast({
                    title: tNewUi("newUi.k6bad7bdb27b7"),
                    body: tNewUi("newUi.k0edc1f0c401d"),
                    tone: "error",
                  }),
              );
            }}
          >
            <Copy />
            {t("chatUiExtra.copyLink")}
          </Button>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">{tNewUi("newUi.kd0150db97db5")}</h3>
        {links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {tNewUi("newUi.k9c4711037567")}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {links.map((link) => (
              <div
                key={link.id}
                className="flex flex-wrap items-center gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{link.externalLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {link.paperclipUserLabel
                      ? `Linked to ${link.paperclipUserLabel}`
                      : (link.externalDetail ?? tNewUi("newUi.k1e31d9596d67"))}
                  </p>
                </div>
                {link.status === "linked" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(link.principalId)}
                  >
                    <Unlink />
                    {t("toolsResidualRound2.revoke")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={createIntent.isPending}
                    onClick={() => createIntent.mutate(link.principalId)}
                  >
                    {tNewUi("newUi.kd972bf7850a7")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Conversations({
  endpointId,
  provider,
}: {
  endpointId: string;
  provider: ChatProvider;
}) {
  const query = useQuery({
    queryKey: queryKeys.chatEndpoints.conversations(endpointId),
    queryFn: () => chatEndpointsApi.listConversations(endpointId),
    ...liveChatQueryOptions,
  });
  const rows = query.data ?? [];
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{tNewUi("newUi.k1d432f58690c")}</h2>
      </div>
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading conversations…</p> : query.isError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">Conversations could not be loaded.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>Try again</Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          {provider === "agentmail"
            ? "No email conversations yet. Send an email to this agent’s address to start one."
            : tNewUi("newUi.kc1c6b0806b90")}
        </p>
      ) : (
        <ul aria-label={tNewUi("newUi.k1d432f58690c")} className="divide-y divide-border overflow-x-auto border-y border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex min-w-xl items-center gap-3 px-2 py-3 text-sm transition-colors hover:bg-accent/50">
              <AppLogo name={providerNames[provider]} brandKey={provider} compact className="size-5! rounded-sm bg-transparent" />
              <div className="flex min-w-0 max-w-56 items-center gap-2">
                <span className="truncate font-medium" title={row.externalLabel}>{row.externalLabel}</span>
                {row.externalUrl && <a href={row.externalUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">{tNewUi("newUi.ked077f3d8125")} {providerNames[provider]}<ExternalLink className="size-3" /></a>}
              </div>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate" title={row.issueTitle ?? undefined}>{row.issueTitle ?? tNewUi("newUi.k2d3edb9384ce")}</span>
                {row.issueId && <Link to={`/issues/${row.issueId}`} className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">{t("pipelinesResidualExtra.openTask")}<ExternalLink className="size-3" /></Link>}
              </div>
              <span className="hidden shrink-0 text-xs text-muted-foreground xl:inline">{row.issueIdentifier}</span>
              {row.state !== "active" && <StatusBadge status={row.state} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Activity({
  endpointId,
  endpoint,
}: {
  endpointId: string;
  endpoint: Awaited<ReturnType<typeof chatEndpointsApi.get>>;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [resolutionItem, setResolutionItem] = useState<ChatActivityItem | null>(
    null,
  );
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const cursor = cursors[cursors.length - 1];
  useEffect(() => setCursors([undefined]), [endpointId]);
  const query = useQuery({
    queryKey: [...queryKeys.chatEndpoints.activity(endpointId), cursor ?? null],
    queryFn: () => chatEndpointsApi.listActivityPage(endpointId, cursor),
    ...liveChatQueryOptions,
    refetchInterval: cursor ? false : liveChatQueryOptions.refetchInterval,
  });
  const replay = useMutation({
    mutationFn: (item: ChatActivityItem) =>
      item.kind === "publication"
        ? chatEndpointsApi.replayPublication(endpointId, item.id)
        : chatEndpointsApi.replayDelivery(endpointId, item.id),
    onSuccess: async (_result, item) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.activity(endpointId),
      });
      pushToast({
        title: `${item.kind === "publication" ? tNewUi("newUi.k15fc65b69327") : tNewUi("newUi.k52bfe584a5fc")} queued for replay`,
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: tNewUi("newUi.ke3eb4a334117"),
        body: error instanceof Error ? error.message : tNewUi("newUi.ka0c2cc1374d9"),
        tone: "error",
      }),
  });
  const resolveActivity = useMutation({
    mutationFn: (input: {
      item: ChatActivityItem;
      action: "mark_delivered" | "retry_anyway" | "cancel";
    }) => {
      if (input.item.kind === "publication") {
        return chatEndpointsApi.resolvePublication(
          endpointId,
          input.item.id,
          input.action,
          input.item.fileTransfer
            ? {
                phase: input.item.fileTransfer.phase,
                version: input.item.fileTransfer.version,
              }
            : undefined,
        );
      }
      return chatEndpointsApi.resolveAction(
        endpointId,
        input.item.id,
        input.action,
      );
    },
    onSuccess: async (_result, input) => {
      setResolutionItem(null);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.activity(endpointId),
      });
      pushToast({
        title:
          input.item.actionType === "slash_task_start" &&
          input.action === "retry_anyway"
            ? tNewUi("newUi.kbd8d39d8d346")
            : input.item.actionType === "slash_task_start"
              ? tNewUi("newUi.k7153d36ad584")
              : input.item.actionType === "provider_effect" &&
                  input.action === "mark_delivered"
                ? tNewUi("newUi.k44de899e075f")
                : input.item.actionType === "provider_effect" &&
                    input.action === "retry_anyway"
                  ? tNewUi("newUi.k989eb240d291")
                  : input.item.actionType === "provider_effect"
                    ? tNewUi("newUi.k91ea1f91c039")
                    : input.action === "mark_delivered"
                      ? tNewUi("newUi.kac3242ebd389")
                      : input.action === "retry_anyway"
                        ? tNewUi("newUi.kf9100c1e661f")
                        : tNewUi("newUi.k67f02b0ad769"),
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: tNewUi("newUi.kfce6f023ce3f"),
        body: error instanceof Error ? error.message : tNewUi("newUi.ka0c2cc1374d9"),
        tone: "error",
      }),
  });
  const lifecycle = useMutation({
    mutationFn: async (action: "pause" | "resume" | "remove") =>
      endpoint.provider === "agentmail"
        ? emailApi.control(endpointId, action)
        : chatEndpointsApi.setup(endpointId, { action }),
    onSuccess: async (next, action) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.list(next.companyId),
      });
      if (endpoint.provider === "agentmail") {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["email-inboxes", next.companyId] }),
          queryClient.invalidateQueries({ queryKey: queryKeys.chatEndpoints.detail(endpointId) }),
        ]);
      }
      if (action === "remove") {
        navigate("/apps");
        return;
      }
      if (endpoint.provider !== "agentmail") queryClient.setQueryData(queryKeys.chatEndpoints.detail(endpointId), next);
      pushToast({
        title: action === "pause" ? tNewUi("newUi.k8870a331d6b3") : tNewUi("newUi.ke10324177de5"),
        tone: "success",
      });
    },
    onError: (error) =>
      pushToast({
        title: tNewUi("newUi.ka99084d879ff"),
        body: error instanceof Error ? error.message : tNewUi("newUi.ka0c2cc1374d9"),
        tone: "error",
      }),
  });
  const rows = query.data?.items ?? [];
  const { status } = endpoint;
  const health = connectionHealthPresentation(endpoint);
  const lifecycleAction = lifecycle.variables;
  const callbackSurfaceRows = endpoint.setup?.callbackSurfaces
    ? ([
        [tNewUi("newUi.kcb40ef1123b4"), endpoint.setup.callbackSurfaces.events],
        [tNewUi("newUi.k1d49a1c3bb23"), endpoint.setup.callbackSurfaces.interactivity],
        [tNewUi("newUi.k85dec3aee05f"), endpoint.setup.callbackSurfaces.slashCommands],
      ] as const)
    : [];
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">{tNewUi("newUi.k52520f2f36e9")}</h2>
      {((status !== "active" && health.message) || health.error) && (
        <div
          className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${status === "attention" || status === "revoked" ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-muted/30 text-foreground"}`}
        >
          {(status === "attention" || status === "revoked") && (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            {health.message && <p>{health.message}</p>}
            {health.previousHealth && (
              <p className="mt-1 text-xs opacity-80">
                <span className="font-medium">{tNewUi("newUi.k1b2bf64e746e")}</span>{" "}
                {health.previousHealth}
              </p>
            )}
            {health.error && (
              <p className="mt-1 text-xs opacity-80">
                <span className="font-medium">{health.errorLabel}:</span>{" "}
                {health.error}
              </p>
            )}
          </div>
        </div>
      )}
      <details className="group rounded-lg border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-medium chat-connection-health-summary">
          <span>{tNewUi("newUi.kde3243d4a18c")}</span>
          <span className="flex items-center gap-2">
            {endpoint.setup?.callbacksNeedUpdate && <span className="text-xs text-(--status-task-blocked)">{tNewUi("newUi.k081c6ae81d29")}</span>}
            <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <div className="space-y-5 border-t border-border p-4">
      {endpoint.provider === "slack" && callbackSurfaceRows.length > 0 && (
        <div
          className="space-y-3 text-sm"
        >
          <p className="font-medium">{tNewUi("newUi.k035e2b309da2")}</p>
          <p className="text-xs text-muted-foreground">
            {endpoint.setup?.callbacksNeedUpdate
              ? tNewUi("newUi.k05d99d55c596")
              : tNewUi("newUi.kb49180a21441")}
          </p>
          <div className="divide-y divide-border border-y border-border">
            {callbackSurfaceRows.map(([label, surface]) => (
              <div key={label} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {surface.status === "current"
                    ? tNewUi("newUi.ke0d1b68224bf")
                    : surface.status === "stale"
                      ? tNewUi("newUi.kb095f498c6c7")
                      : tNewUi("newUi.k1d3efcd60643")}
                </p>
                {surface.observedAt && (
                  <p className="text-xs text-muted-foreground">
                    {tNewUi("newUi.kff41889613bc")}{" "}
                    <time
                      dateTime={surface.observedAt}
                      title={surface.observedAt}
                      className="font-mono"
                    >
                      {formatDateTime(surface.observedAt, {
                        includeSeconds: true,
                      })}
                    </time>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {status !== "archived" && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            {status === "active" && (
              <Button
                variant="outline"
                disabled={lifecycle.isPending}
                onClick={() => lifecycle.mutate("pause")}
              >
                {lifecycle.isPending && lifecycleAction === "pause" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Pause />
                )}
                {tNewUi("newUi.k858e4ba7a29f")}
              </Button>
            )}
            {status === "paused" && (
              <Button
                variant="outline"
                disabled={lifecycle.isPending}
                onClick={() => lifecycle.mutate("resume")}
              >
                {lifecycle.isPending && lifecycleAction === "resume" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Play />
                )}
                {tNewUi("newUi.kd640c7421da0")}
              </Button>
            )}
            {[
              "active",
              "paused",
              "attention",
              "revoked",
              "draft",
              "verifying",
            ].includes(status) && (
              <Button
                variant="outline"
                disabled={lifecycle.isPending}
                onClick={() =>
                  navigate(
                    endpoint.provider === "agentmail" && status !== "draft" && status !== "verifying"
                      ? `/apps/chat/${endpoint.id}/settings`
                      : `/apps/chat/connect?provider=${endpoint.provider}&purpose=chat&resume=${endpoint.id}${status === "draft" || status === "verifying" ? "" : "&reconnect=1"}`,
                  )
                }
              >
                <RefreshCw />
                {status === "draft" || status === "verifying"
                  ? tNewUi("newUi.kbc01ae77f37c")
                  : tNewUi("newUi.kbf8a9eab9e7e")}
              </Button>
            )}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={lifecycle.isPending}
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2 />
              {tNewUi("newUi.ke9e9e26c6c2f")}
            </Button>
          </div>
          {status !== "draft" && status !== "verifying" && (
            <p className="text-xs text-muted-foreground">
              {providerLifecycleGuidance[endpoint.provider].reconnect}
            </p>
          )}
        </div>
      )}
        </div>
      </details>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          {t("appDetail.activity.title")}
        </h3>
        {endpoint.provider === "agentmail" && rows.some((item) => item.kind === "publication" && item.status === "delivery_unknown") && (
          <p className="text-sm text-muted-foreground">
            Review unconfirmed email delivery in the{" "}
            <Link to={`/apps/chat/${endpointId}/conversations`} className="underline underline-offset-4">conversation’s task</Link>.
          </p>
        )}
        <div className="divide-y divide-border border-y border-border">
          {query.isLoading && (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tNewUi("newUi.ka389c395010e")}
            </div>
          )}
          {query.isError && (
            <div className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm text-destructive" role="alert">
                {tNewUi("newUi.k65047eb0ce81")}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => query.refetch()}
              >
                {tNewUi("newUi.kd8b8392e2c54")}
              </Button>
            </div>
          )}
          {!query.isLoading &&
            !query.isError &&
            rows.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 px-2 py-3 transition-colors hover:bg-accent/50"
              >
                <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
                  {item.kind === "delivery" ? <ArrowDownLeft className="size-4" /> : item.kind === "publication" ? <ArrowUpRight className="size-4" /> : <ActivityIcon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="min-w-0 flex-1 text-sm font-medium">{item.summary}</p>
                    <StatusBadge status={item.status} />
                    <time dateTime={item.createdAt} title={item.createdAt} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatDateTime(item.createdAt, { includeSeconds: true })}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{activityKindLabels[item.kind]}</p>
                  {item.fileTransfer && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.fileTransfer.filename} —{" "}
                      {item.fileTransfer.phase.replaceAll("_", " ")}
                    </p>
                  )}
                  {item.detail && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {activityDetailLabel(item)}:
                      </span>{" "}
                      {item.detail}
                    </p>
                  )}
                </div>
                {endpoint.provider !== "agentmail" && isReplayEligible(item) && (
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Replay failed ${item.kind}`}
                    disabled={replay.isPending}
                    onClick={() => replay.mutate(item)}
                  >
                    {replay.isPending && replay.variables?.id === item.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    {tNewUi("newUi.kc8dae6371b33")}
                  </Button>
                )}
                {endpoint.provider !== "agentmail" && isResolutionEligible(item) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResolutionItem(item)}
                  >
                    {t("annotationsExtra.resolve")}
                  </Button>
                )}
              </div>
            ))}
          {!query.isLoading && !query.isError && rows.length === 0 && (
            <p className="py-5 text-sm text-muted-foreground">
              {tNewUi("newUi.k3ba50fcde806")}
            </p>
          )}
        </div>
      </div>
      <nav aria-label={tNewUi("newUi.k0275649337f8")} className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{tNewUi("newUi.k0a30a815d67d")} {cursors.length}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors((pages) => pages.slice(0, -1))}>{t("pipelinesExtra.page.previous")}</Button>
          <Button size="sm" variant="outline" disabled={!query.data?.nextCursor || query.isFetching || query.isError} onClick={() => { if (query.data?.nextCursor) setCursors((pages) => [...pages, query.data.nextCursor!]); }}>{t("companySkills.next")}</Button>
        </div>
      </nav>
      <AlertDialog
        open={resolutionItem !== null}
        onOpenChange={(open) => !open && setResolutionItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resolutionItem?.actionType === "slash_task_start"
                ? tNewUi("newUi.k24ac2c2017a3")
                : resolutionItem?.actionType === "provider_effect"
                  ? tNewUi("newUi.k51da03a75810")
                  : tNewUi("newUi.ka1666eb3a23c")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resolutionItem?.actionType === "slash_task_start"
                ? tNewUi("newUi.kb30cde4a42f3")
                : resolutionItem?.actionType === "provider_effect"
                  ? tNewUi("newUi.kcfdcf622a9a8")
                  : resolutionItem
                    ? activityResolutionDescription(resolutionItem)
                    : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel disabled={resolveActivity.isPending}>
              {tNewUi("newUi.k0de1079d12fd")}
            </AlertDialogCancel>
            {resolutionItem &&
              activityResolutionActions(resolutionItem).includes("cancel") && (
                <Button
                  variant="outline"
                  disabled={resolveActivity.isPending}
                  onClick={() =>
                    resolutionItem &&
                    resolveActivity.mutate({
                      item: resolutionItem,
                      action: "cancel",
                    })
                  }
                >
                  {resolutionItem.actionType === "slash_task_start"
                    ? tNewUi("newUi.ka2029d82cf80")
                    : resolutionItem.actionType === "provider_effect"
                      ? tNewUi("newUi.k7cb71ee3e52e")
                      : resolutionItem.fileTransfer
                        ? tNewUi("newUi.kad463f14df6d")
                        : tNewUi("newUi.k43d329317663")}
                </Button>
              )}
            {resolutionItem &&
              activityResolutionActions(resolutionItem).includes(
                "retry_anyway",
              ) && (
                <Button
                  variant="outline"
                  disabled={resolveActivity.isPending}
                  onClick={() =>
                    resolutionItem &&
                    resolveActivity.mutate({
                      item: resolutionItem,
                      action: "retry_anyway",
                    })
                  }
                >
                  {resolutionItem.fileTransfer
                    ? tNewUi("newUi.ka2a1662f6829")
                    : tNewUi("newUi.kde4695604d51")}
                </Button>
              )}
            {resolutionItem &&
              activityResolutionActions(resolutionItem).includes(
                "mark_delivered",
              ) && (
                <AlertDialogAction
                  disabled={resolveActivity.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    if (resolutionItem) {
                      resolveActivity.mutate({
                        item: resolutionItem,
                        action: "mark_delivered",
                      });
                    }
                  }}
                >
                  {tNewUi("newUi.k3a47653eb724")}
                </AlertDialogAction>
              )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tNewUi("newUi.ke91e08c0b06c")}</AlertDialogTitle>
            <AlertDialogDescription>
              {endpoint.assignedAgentName} {tNewUi("newUi.kb875c1b5c98b")}
              {` ${providerNames[endpoint.provider]}`}{tNewUi("newUi.keda77d69e522")}{" "}
              {providerLifecycleGuidance[endpoint.provider].remove}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("taskDetail.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={lifecycle.isPending}
              onClick={() => lifecycle.mutate("remove")}
            >
              {lifecycle.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {tNewUi("newUi.ke9e9e26c6c2f")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
