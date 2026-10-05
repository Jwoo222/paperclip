import { t as tNewUi } from "@/i18n";
import {
  connectionSetupVerbForApp,
  isRetiredComposioConnection,
} from "@paperclipai/shared";
import { ManagedAiConnectionRow } from "@/components/ai-connections/ManagedAiConnectionDetails";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardPaste,
  Clock3,
  Link2,
  Loader2,
  MoreHorizontal,
  PauseCircle,
  Search,
  ServerCog,
  Trash2,
} from "lucide-react";
import type { ToolApplication, ToolConnection } from "@paperclipai/shared";
import {
  getAppDefinitionForUrl,
  isMemoryConnectorId,
  getAppStoreDefinition,
  isToolConnectionAttentionHealth,
  aiSubscriptionNeedsIsolatedLogin,
  GOOGLE_WORKSPACE_CONNECTOR_PROFILES,
} from "@paperclipai/shared";
import { useNavigate } from "@/lib/router";
import { useChatConnectorsEnabled } from "@/hooks/useChatConnectorsEnabled";
import { useMemoryConnectorsEnabled } from "@/hooks/useMemoryConnectorsEnabled";
import { appCopyFor } from "@/lib/app-gallery-copy";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { toolsApi } from "@/api/tools";
import { emailApi } from "@/api/email";
import {
  chatEndpointsApi,
  type ChatEndpoint,
  type ChatProvider,
} from "@/api/chatEndpoints";
import { accessApi } from "@/api/access";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCompanyUserProfileMap } from "@/lib/company-members";
import { AppLogo } from "./AppLogo";
import {
  appApplicationSourceSlug,
  appConnectionSourceSlug,
  appDefinitionDarkLogoUrl,
  appDefinitionDescription,
  appDefinitionLogoUrl,
  appDefinitionName,
  appDefinitionSlug,
  type AppGalleryDisplayEntry,
} from "./app-definition-display";
import {
  appSourceConnectHref,
  appSourceResumeHref,
  appSupportsToolCatalogSetup,
} from "./app-connect-policy";
import {
  ConnectionOwnerIdentity,
  connectionDisplayNameForOwner,
  connectionOwnerProfile,
  type ConnectionOwnerProfile,
} from "./connection-owner";

type ConnectorRowModel = {
  key: string;
  slug: string;
  name: string;
  description: string;
  brandKey: string;
  logoUrl?: string | null;
  darkLogoUrl?: string | null;
  entry: AppGalleryDisplayEntry | null;
  applications: ToolApplication[];
  connections: ToolConnection[];
  chatEndpoints: ChatEndpoint[];
};

type ConnectionState = {
  kind: "connected" | "attention" | "paused" | "draft";
  label: string;
  message: string | null;
};

type ConnectionRemovalTarget = {
  id: string;
  accountName: string;
  providerName: string;
  remainingConnectionCount: number;
} & ({ kind: "chat"; provider: ChatProvider } | { kind?: undefined });

// Temporary, page-only hold until Google OAuth verification is approved.
// Keep definitions, direct setup/management routes, and runtime access intact.
// Remove this filter after approval; reviewer instances stay on their pinned build.
const GOOGLE_CONNECTOR_SLUGS = new Set(
  Object.values(GOOGLE_WORKSPACE_CONNECTOR_PROFILES).map((profile) => profile.appSlug),
);

function chatProviderForSlug(slug: string): ChatProvider | null {
  const method = getAppStoreDefinition(slug)?.methods.find(
    (candidate) =>
      candidate.purpose === "channel" &&
      candidate.provider,
  );
  return method?.provider ?? null;
}

function chatConnectHref(
  slug: string,
  toolHref: string | null,
  agentId?: string | null,
): string | null {
  const definition = getAppStoreDefinition(slug);
  const provider = chatProviderForSlug(slug);
  if (!definition || !provider) return null;
  const params = new URLSearchParams({ provider });
  const hasToolMethod = definition.methods.some(
    (method) => method.purpose === "tool" && method.transport !== "chat_sdk",
  );
  const effectiveToolHref = hasToolMethod
    ? (toolHref ?? `/apps/connect?source=${slug}`)
    : null;
  if (effectiveToolHref) params.set("toolHref", effectiveToolHref);
  else params.set("purpose", "chat");
  if (agentId) params.set("agentId", agentId);
  return `/apps/chat/connect?${params.toString()}`;
}

function connectHrefFor(entry: AppGalleryDisplayEntry): string | null {
  const slug = appDefinitionSlug(entry);
  const definition = getAppStoreDefinition(slug);
  return appSupportsToolCatalogSetup(definition)
    ? appSourceConnectHref(slug)
    : null;
}

function additionalConnectionHref(
  entry: AppGalleryDisplayEntry,
  applicationId: string,
): string | null {
  const baseHref = connectHrefFor(entry);
  if (!baseHref) return null;
  const [path, rawQuery = ""] = baseHref.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("applicationId", applicationId);
  params.set("name", appDefinitionName(entry));
  params.set("new", "1");
  return `${path}?${params.toString()}`;
}

function connectionState(connection: ToolConnection): ConnectionState {
  if (isRetiredComposioConnection(connection)) {
    return { kind: "attention", label: tNewUi("newUi.ka9f71bc2404c"), message: tNewUi("connectorsBrowse.retiredComposio") };
  }
  if (connection.status === "draft") {
    return {
      kind: "draft",
      label: tNewUi("newUi.k167fc0f362b7"),
      message: tNewUi("newUi.k631d427ee3ba"),
    };
  }
  if (connection.enabled === false || connection.status === "disabled") {
    return {
      kind: "paused",
      label: tNewUi("newUi.ke159b06187d3"),
      message: tNewUi("newUi.k17c03df7452b"),
    };
  }
  if ((connection.connectionPurpose === "ai" && (connection.healthStatus !== "ok" || aiSubscriptionNeedsIsolatedLogin(connection.config))) || isToolConnectionAttentionHealth(connection.healthStatus)) {
    return {
      kind: "attention",
      label: tNewUi("newUi.kc1ebc7817870"),
      message:
        connection.healthMessage ??
        connection.lastError ??
        (connection.authKind === "oauth"
          ? tNewUi("newUi.kad02ba436933")
          : tNewUi("newUi.kba0731ed82d2")),
    };
  }
  return { kind: "connected", label: tNewUi("newUi.k22965568d22a"), message: null };
}

function connectionRank(connection: ToolConnection): number {
  return connection.status === "draft" ? 0 : 1;
}

function rowRank(row: ConnectorRowModel): number {
  if (
    row.chatEndpoints.some((endpoint) => endpoint.status !== "draft") ||
    row.connections.some((connection) => connectionRank(connection) === 1)
  )
    return 2;
  return row.connections.length > 0 || row.chatEndpoints.length > 0 ? 1 : 0;
}

function connectorAction(
  row: ConnectorRowModel,
  chatConnectorsEnabled: boolean,
  agentId?: string | null,
): {
  label: string;
  href: string | null;
  title?: string;
} {
  const applicationId = row.applications[0]?.id ?? null;
  const chatHref = (row.slug === "agentmail" || chatConnectorsEnabled)
    ? chatConnectHref(
        row.slug,
        row.entry ? connectHrefFor(row.entry) : null,
        agentId,
      )
    : null;
  if (row.connections.length > 0 || row.chatEndpoints.length > 0) {
    if (chatHref) return { label: tNewUi("newUi.k685f88ae3db2"), href: chatHref };
    if (row.entry && applicationId) {
      return {
        label: tNewUi("newUi.kee7ee5830f09"),
        href: additionalConnectionHref(row.entry, applicationId),
      };
    }
    return {
      label: tNewUi("newUi.kee7ee5830f09"),
      href: applicationId ? `/apps/app/${applicationId}/permissions` : null,
    };
  }

  if (row.entry?.availability?.available === false) {
    return {
      label: tNewUi("newUi.kca1844969742"),
      href: null,
      title:
        row.entry.availability.reason ??
        tNewUi("newUi.k1ff1cbc2e28a"),
    };
  }
  if (chatHref) return { label: tNewUi("newUi.k1a2303ede074"), href: chatHref };
  // PAP-659 C4: the card's verb comes from the same four-state resolver the
  // connect screen uses, so "Connect" never turns out to mean "paste a key".
  if (row.entry) {
    return {
      label: connectionSetupVerbForApp(row.entry) === "Add key" ? tNewUi("upgrade2610Apps.browse.addKey") : tNewUi("newUi.k1a2303ede074"),
      href: connectHrefFor(row.entry),
    };
  }
  return {
    label: tNewUi("newUi.k1a2303ede074"),
    href: applicationId ? `/apps/app/${applicationId}/permissions` : null,
  };
}

function accountActionHref(
  row: ConnectorRowModel,
  connection: ToolConnection,
): string {
  if (connection.status === "draft" && row.entry) {
    return appSourceResumeHref(row.slug, connection.id);
  }
  return `/apps/${connection.id}/permissions`;
}

/**
 * The Apps landing page is the single connector catalog and account-management
 * surface. Connected providers sort first and expand in place to show every
 * account; unconnected providers retain the same catalog setup flows.
 */
export function Browse({ renderAccountDetails = (connection) => connection.connectionPurpose === "ai" ? <ManagedAiConnectionRow connection={connection} /> : null }: { renderAccountDetails?: (connection: ToolConnection) => ReactNode } = {}) {
  const navigate = useNavigate();
  const preselectedChatAgentId =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("chatAgentId");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompany();
  const { enabled: chatConnectorsEnabled } = useChatConnectorsEnabled();
  const { enabled: memoryConnectorsEnabled } = useMemoryConnectorsEnabled();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [query, setQuery] = useState("");
  const [connectionToRemove, setConnectionToRemove] =
    useState<ConnectionRemovalTarget | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: tNewUi("newUi.kc3d2e79ebdd0") }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const galleryQuery = useQuery({
    queryKey: queryKeys.apps.gallery(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listGallery(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const applicationsQuery = useQuery({
    queryKey: queryKeys.tools.applications(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listApplications(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const connectionsQuery = useQuery({
    queryKey: queryKeys.tools.connections(selectedCompanyId ?? "__none__"),
    queryFn: () => toolsApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const chatEndpointsQuery = useQuery({
    queryKey: queryKeys.chatEndpoints.list(selectedCompanyId ?? "__none__"),
    queryFn: () => chatEndpointsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const userDirectoryQuery = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(
      selectedCompanyId ?? "__none__",
    ),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const removeConnection = useMutation({
    mutationFn: async (target: ConnectionRemovalTarget) => {
      if (target.kind === "chat") {
        if (target.provider === "agentmail") {
          await emailApi.control(target.id, "remove");
        } else {
          await chatEndpointsApi.setup(target.id, { action: "remove" });
        }
      } else {
        await toolsApi.archiveConnection(target.id);
      }
    },
    onSuccess: (_connection, target) => {
      queryClient.invalidateQueries({ queryKey: ["email-inboxes", selectedCompanyId!] });
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatEndpoints.list(selectedCompanyId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.tools.connections(selectedCompanyId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.tools.applications(selectedCompanyId!),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.apps.attention(selectedCompanyId!),
      });
      pushToast({
        title: tNewUi("newUi.k2d806d0fa1a0"),
        body:
          target.kind === "chat"
            ? tNewUi("connectorsBrowse.removedChat", { provider: target.providerName })
            : target.remainingConnectionCount > 0
            ? tNewUi(target.remainingConnectionCount === 1 ? "connectorsBrowse.removedOtherOne" : "connectorsBrowse.removedOtherMany", { provider: target.providerName, count: target.remainingConnectionCount })
            : tNewUi("connectorsBrowse.removedOtherNone", { provider: target.providerName }),
        tone: "success",
      });
      setConnectionToRemove(null);
    },
    onError: (error) =>
      pushToast({
        title: tNewUi("newUi.k3999fa23e32b"),
        body: error instanceof Error ? error.message : tNewUi("newUi.keea4fb33efd3"),
        tone: "error",
      }),
  });

  const gallery = (
    (galleryQuery.data?.apps ?? []) as AppGalleryDisplayEntry[]
  ).filter((entry) => {
    if (!memoryConnectorsEnabled && isMemoryConnectorId(appDefinitionSlug(entry))) return false;
    const definition = getAppStoreDefinition(appDefinitionSlug(entry));
    return (
      appDefinitionSlug(entry) === "agentmail" || chatConnectorsEnabled ||
      !definition?.methods.some((method) => method.purpose === "channel") ||
      appSupportsToolCatalogSetup(definition)
    );
  });
  const userProfileById = useMemo(
    () => buildCompanyUserProfileMap(userDirectoryQuery.data?.users),
    [userDirectoryQuery.data],
  );

  const rows = useMemo<ConnectorRowModel[]>(() => {
    const activeConnections = (connectionsQuery.data?.connections ?? []).filter(
      (connection) =>
        connection.status !== "archived" &&
        connection.connectionPurpose !== "channel",
    );
    const activeApplications = (
      applicationsQuery.data?.applications ?? []
    ).filter(
      (application) =>
        application.status !== "archived" &&
        application.type !== "chat" &&
        application.metadata?.purpose !== "channel",
    );
    const connectionsByApplicationId = new Map<string, ToolConnection[]>();
    for (const connection of activeConnections) {
      connectionsByApplicationId.set(connection.applicationId, [
        ...(connectionsByApplicationId.get(connection.applicationId) ?? []),
        connection,
      ]);
    }

    const gallerySlugs = new Set(
      gallery.map((entry) => appDefinitionSlug(entry)),
    );
    const gallerySlugByName = new Map(
      gallery.map((entry) => [
        appDefinitionName(entry).trim().toLocaleLowerCase(),
        appDefinitionSlug(entry),
      ]),
    );
    const rowsBySlug = new Map<string, ConnectorRowModel>();
    for (const entry of gallery) {
      const slug = appDefinitionSlug(entry);
      rowsBySlug.set(slug, {
        key: `gallery:${slug}`,
        slug,
        name: appDefinitionName(entry),
        description:
          !chatConnectorsEnabled && slug !== "agentmail" && chatProviderForSlug(slug)
            ? appCopyFor(slug).tagline
            : appDefinitionDescription(entry),
        brandKey: slug,
        logoUrl: appDefinitionLogoUrl(entry),
        darkLogoUrl: appDefinitionDarkLogoUrl(entry),
        entry,
        applications: [],
        connections: [],
        chatEndpoints: [],
      });
    }
    const nativeChatApps = [
      { slug: "agentmail", name: "AgentMail", description: tNewUi("appCatalog.kd29107eb0fb0") },
      { slug: "imessage-photon", name: "iMessage Photon", description: tNewUi("newUi.k4d7f37676f47") },
      {
        slug: "slack",
        name: "Slack",
        description:
          tNewUi("newUi.k0af5aaac259f"),
      },
      {
        slug: "github-code-review-bot",
        name: "GitHub Code Review Bot",
        description:
          tNewUi("upgrade2610Apps.browse.githubCodeReviewBotDescription"),
      },
      {
        slug: "discord",
        name: "Discord",
        description:
          tNewUi("newUi.kceb5e587099e"),
      },
      {
        slug: "microsoft-teams",
        name: "Microsoft Teams",
        description: tNewUi("newUi.k5c50f9893170"),
      },
      {
        slug: "telegram",
        name: "Telegram",
        description:
          tNewUi("newUi.ka2dfd70fb625"),
      },
    ] as const;
    for (const item of nativeChatApps.filter(item => item.slug === "agentmail" || chatConnectorsEnabled)) {
      if (rowsBySlug.has(item.slug)) continue;
      rowsBySlug.set(item.slug, {
        key: `native-chat:${item.slug}`,
        slug: item.slug,
        name: item.name,
        description: item.description,
        brandKey: item.slug,
        entry: null,
        applications: [],
        connections: [],
        chatEndpoints: [],
      });
    }

    const customRows: ConnectorRowModel[] = [];
    for (const application of activeApplications) {
      const applicationSlug = appApplicationSourceSlug(application);
      const savedAppConnections =
        connectionsByApplicationId.get(application.id) ?? [];
      const appConnections = savedAppConnections.filter(
        (connection) => !GOOGLE_CONNECTOR_SLUGS.has(appConnectionSourceSlug(connection) ?? ""),
      );
      // Hide source-only Google rows, but keep independently identified connectors.
      if (
        (!applicationSlug || applicationSlug === "link") &&
        savedAppConnections.length > 0 &&
        appConnections.length === 0
      ) continue;
      const configuredConnectionSlug = appConnections
        .map(
          (connection) =>
            connection.config?.sourceTemplateKey ??
            connection.transportConfig?.sourceTemplateKey,
        )
        .find(
          (value): value is string =>
            typeof value === "string" && gallerySlugs.has(value),
        );
      const endpointMatchedSlug = appConnections
        .flatMap((connection) => [
          connection.config?.url,
          connection.transportConfig?.url,
        ])
        .map((value) =>
          typeof value === "string"
            ? appDefinitionSlug(getAppDefinitionForUrl(value, gallery)) || null
            : null,
        )
        .find((value): value is string => Boolean(value));
      const resolvedSlug =
        applicationSlug &&
        applicationSlug !== "link" &&
        gallerySlugs.has(applicationSlug)
          ? applicationSlug
          : (configuredConnectionSlug ??
            endpointMatchedSlug ??
            gallerySlugByName.get(
              application.name.trim().toLocaleLowerCase(),
            ) ??
            null);
      const galleryRow = resolvedSlug ? rowsBySlug.get(resolvedSlug) : null;
      if (galleryRow) {
        galleryRow.applications.push(application);
        galleryRow.connections.push(...appConnections);
        continue;
      }

      customRows.push({
        key: `application:${application.id}`,
        slug: applicationSlug ?? application.id,
        name: application.name,
        description:
          application.description ??
          tNewUi("newUi.k6802bba651f5"),
        brandKey: applicationSlug ?? application.name,
        entry: null,
        applications: [application],
        connections: appConnections,
        chatEndpoints: [],
      });
    }

    for (const endpoint of (chatEndpointsQuery.data ?? []).filter(endpoint => endpoint.provider === "agentmail" || chatConnectorsEnabled)) {
      if (endpoint.status === "archived") continue;
      let target = [...rowsBySlug.values()].find(
        (row) => chatProviderForSlug(row.slug) === endpoint.provider,
      );
      if (!target) {
        const names = {
          slack: "Slack",
          github: "GitHub",
          discord: "Discord",
          "microsoft-teams": "Microsoft Teams",
          telegram: "Telegram",
          "imessage-photon": "iMessage Photon",
  agentmail: "AgentMail",
        } as const;
        target = {
          key: `chat:${endpoint.provider}`,
          slug: endpoint.provider,
          name: names[endpoint.provider],
        description: tNewUi("connectorsBrowse.chatThrough", { provider: names[endpoint.provider] }),
          brandKey: endpoint.provider,
          entry: null,
          applications: [],
          connections: [],
          chatEndpoints: [],
        };
        customRows.push(target);
      }
      target.chatEndpoints.push(endpoint);
    }

    return [...rowsBySlug.values(), ...customRows]
      .filter((row) => !GOOGLE_CONNECTOR_SLUGS.has(row.slug))
      .map((row) => ({
        ...row,
        connections: [...row.connections].sort(
          (left, right) =>
            connectionRank(right) - connectionRank(left) ||
            left.name.localeCompare(right.name, undefined, {
              sensitivity: "base",
            }),
        ),
      }))
      .sort(
        (left, right) =>
          rowRank(right) - rowRank(left) ||
          left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          }) ||
          left.key.localeCompare(right.key),
      );
  }, [
    applicationsQuery.data,
    chatEndpointsQuery.data,
    chatConnectorsEnabled,
    connectionsQuery.data,
    gallery,
  ]);

  const trimmed = query.trim().toLocaleLowerCase();
  const visibleRows = useMemo(() => {
    if (!trimmed) return rows;
    return rows.filter(
      (row) =>
        row.name.toLocaleLowerCase().includes(trimmed) ||
        row.description.toLocaleLowerCase().includes(trimmed) ||
        row.entry?.description?.toLocaleLowerCase().includes(trimmed) ||
        row.connections.some((connection) =>
          connection.name.toLocaleLowerCase().includes(trimmed),
        ) ||
        row.chatEndpoints.some((endpoint) =>
          endpoint.assignedAgentName.toLocaleLowerCase().includes(trimmed),
        ),
    );
  }, [rows, trimmed]);
  const showCustomConnector =
    !trimmed || "connect your own tool custom mcp server".includes(trimmed);

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {tNewUi("newUi.k85993a68ec7d")}
      </div>
    );
  }

  const loading =
    galleryQuery.isLoading ||
    applicationsQuery.isLoading ||
    connectionsQuery.isLoading ||
    chatEndpointsQuery.isLoading;
  const loadFailed =
    galleryQuery.isError ||
    applicationsQuery.isError ||
    connectionsQuery.isError ||
    chatEndpointsQuery.isError;
  const nothingMatches = visibleRows.length === 0 && !showCustomConnector;

  return (
    <div className="max-w-5xl space-y-5 pb-12">
      <header className="flex justify-start">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tNewUi("newUi.kfad7e42dfd24")}
            aria-label={tNewUi("newUi.k706a6068c6a0")}
            className="pl-9"
          />
        </div>
      </header>

      {loadFailed ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">
            {tNewUi("newUi.k3cd3b1e54a29")}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void galleryQuery.refetch();
              void applicationsQuery.refetch();
              void connectionsQuery.refetch();
              void chatEndpointsQuery.refetch();
            }}
          >
            {tNewUi("newUi.kd8b8392e2c54")}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3" aria-label={tNewUi("newUi.k2d1897ee9664")}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : nothingMatches ? (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <Link2 className="h-4 w-4" />
          {tNewUi("connectorsBrowse.noMatches", { query: query.trim() })}
        </p>
      ) : (
        <div className="space-y-3" role="list" aria-label={tNewUi("newUi.k3bbef1f6f3df")}>
          {visibleRows.map((row) => (
            <ConnectorCard
              renderAccountDetails={renderAccountDetails}
              key={row.key}
              row={row}
              userProfileById={userProfileById}
              onNavigate={navigate}
              onRequestRemove={setConnectionToRemove}
              preselectedAgentId={preselectedChatAgentId}
              chatConnectorsEnabled={chatConnectorsEnabled}
            />
          ))}
          {showCustomConnector ? (
            <CustomConnectorCard onNavigate={navigate} />
          ) : null}
        </div>
      )}

      <AlertDialog
        open={connectionToRemove !== null}
        onOpenChange={(open) => {
          if (!open && !removeConnection.isPending) setConnectionToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tNewUi("connectorsBrowse.removeTitle", { account: connectionToRemove?.accountName ?? tNewUi("connectorsBrowse.thisAccount") })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {connectionToRemove?.kind === "chat"
                ? tNewUi("connectorsBrowse.removeChatDescription", { provider: connectionToRemove.providerName })
                : connectionToRemove &&
                    connectionToRemove.remainingConnectionCount > 0
                  ? tNewUi(connectionToRemove.remainingConnectionCount === 1 ? "connectorsBrowse.removeOtherDescriptionOne" : "connectorsBrowse.removeOtherDescriptionMany", { provider: connectionToRemove.providerName, count: connectionToRemove.remainingConnectionCount })
                  : tNewUi("newUi.k9c0b82dfa8b4")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeConnection.isPending}>
              {tNewUi("newUi.k19766ed6ccb2")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!connectionToRemove || removeConnection.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (connectionToRemove)
                  removeConnection.mutate(connectionToRemove);
              }}
            >
              {removeConnection.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 />
              )}
              {removeConnection.isPending ? "Removing…" : tNewUi("newUi.ke9e9e26c6c2f")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function ConnectorCard({
  renderAccountDetails,
  row,
  userProfileById,
  onNavigate,
  onRequestRemove,
  preselectedAgentId,
  chatConnectorsEnabled,
}: {
  renderAccountDetails?: (connection: ToolConnection) => ReactNode;
  row: ConnectorRowModel;
  userProfileById: ReadonlyMap<string, ConnectionOwnerProfile>;
  onNavigate: (href: string) => void;
  onRequestRemove: (target: ConnectionRemovalTarget) => void;
  preselectedAgentId?: string | null;
  chatConnectorsEnabled: boolean;
}) {
  const action = connectorAction(
    row,
    chatConnectorsEnabled,
    preselectedAgentId,
  );
  return (
    <div
      role="listitem"
      data-app-slug={row.slug}
      data-connected={
        row.connections.length > 0 || row.chatEndpoints.length > 0
          ? "true"
          : "false"
      }
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <AppLogo
          name={row.name}
          brandKey={row.brandKey}
          logoUrl={row.logoUrl}
          darkLogoUrl={row.darkLogoUrl}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{row.name}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.description}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!action.href}
          title={action.title}
          onClick={() => {
            if (action.href) onNavigate(row.slug === "agentmail"
              ? `${action.href}&setupId=${crypto.randomUUID()}` : action.href);
          }}
          aria-label={tNewUi("connectorsBrowse.actionFor", { action: action.label, name: row.name })}
        >
          {action.label}
        </Button>
      </div>

      {row.connections.length > 0 ? (
        <div className="divide-y divide-border border-t border-border">
          {row.connections.map((connection) => (
            <ConnectionAccountRow
              details={renderAccountDetails?.(connection)}
              key={connection.id}
              row={row}
              connection={connection}
              owner={connectionOwnerProfile(connection, userProfileById)}
              onNavigate={onNavigate}
              onRemove={() => {
                const accountName = connectionDisplayNameForOwner(
                  connection,
                  row.name,
                  connectionOwnerProfile(connection, userProfileById),
                );
                onRequestRemove({
                  id: connection.id,
                  accountName,
                  providerName: row.name,
                  remainingConnectionCount: row.connections.filter(
                    (candidate) =>
                      candidate.id !== connection.id &&
                      candidate.status === "active" &&
                      candidate.enabled,
                  ).length,
                });
              }}
            />
          ))}
        </div>
      ) : null}
      {row.chatEndpoints.length > 0 ? (
        <div className="divide-y divide-border border-t border-border">
          {row.chatEndpoints.map((endpoint) => (
            <div
              key={endpoint.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-sm font-medium hover:underline"
                  onClick={() =>
                    onNavigate(`/apps/chat/${endpoint.id}/settings`)
                  }
                >
                  {endpoint.assignedAgentName} · {endpoint.provider === "agentmail" ? tNewUi("newUi.k969ccbd3cf63") : endpoint.provider === "github" ? tNewUi("upgrade2610Apps.browse.codeReviewBot") : tNewUi("newUi.k460b3a7da007")}
                </button>
                <p className="truncate text-xs text-muted-foreground">
                  {endpoint.providerAccountLabel ??
                    endpoint.botLabel ??
                    tNewUi("newUi.k656eefd90b92")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {endpoint.status.replace(/_/g, " ")}
                </span>
                {endpoint.status === "draft" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigate(`/apps/chat/connect?provider=${endpoint.provider}&purpose=chat&resume=${endpoint.id}`)}
                  >
                    {tNewUi("newUi.kbc01ae77f37c")}
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={tNewUi("connectorsBrowse.manageEndpoint", { agent: endpoint.assignedAgentName, provider: row.name })}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onNavigate(`/apps/chat/${endpoint.id}/settings`)}>
                      {tNewUi("newUi.k5a23444828db")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onRequestRemove({
                        kind: "chat",
                        provider: endpoint.provider,
                        id: endpoint.id,
                        accountName: `${endpoint.assignedAgentName} · ${row.name}`,
                        providerName: row.name,
                        remainingConnectionCount: 0,
                      })}
                    >
                      <Trash2 />
                      {tNewUi("newUi.ke9e9e26c6c2f")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConnectionAccountRow({
  details,
  row,
  connection,
  owner,
  onNavigate,
  onRemove,
}: {
  details?: ReactNode;
  row: ConnectorRowModel;
  connection: ToolConnection;
  owner: ConnectionOwnerProfile | null;
  onNavigate: (href: string) => void;
  onRemove: () => void;
}) {
  const state = connectionState(connection);
  const actionHref = accountActionHref(row, connection);
  const accountName = connectionDisplayNameForOwner(
    connection,
    row.name,
    owner,
  );

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <ConnectionStatusIcon state={state} />
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full cursor-pointer truncate text-left text-sm font-medium text-foreground hover:underline focus-visible:underline"
            aria-label={tNewUi("connectorsBrowse.openPermissions", { account: accountName })}
            onClick={() => onNavigate(`/apps/${connection.id}/permissions`)}
          >
            {accountName}
          </button>
          {details}
          {state.message ? (
            <div
              className={
                state.kind === "attention"
                  ? "truncate text-xs text-destructive"
                  : "truncate text-xs text-muted-foreground"
              }
            >
              {state.message}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{tNewUi("newUi.k9952ce521b78")}</span>
          <ConnectionOwnerIdentity owner={owner} />
        </div>
        {state.kind === "attention" || state.kind === "draft" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onNavigate(actionHref)}
          >
            {state.kind === "attention"
              ? connection.requiresReauthorization === false
                ? tNewUi("newUi.ke5222230e095")
                : tNewUi("newUi.kbf8a9eab9e7e")
              : tNewUi("newUi.kbc01ae77f37c")}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={tNewUi("connectorsBrowse.manageConnection", { account: accountName })}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => onNavigate(`/apps/${connection.id}/permissions`)}
            >
              {tNewUi("newUi.kabccc78cc93c")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 />
              {tNewUi("newUi.ke9e9e26c6c2f")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ConnectionStatusIcon({ state }: { state: ConnectionState }) {
  if (state.kind === "connected") {
    return (
      <span
        className="mt-0.5 text-emerald-600 dark:text-emerald-400"
        title={state.label}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{state.label}</span>
      </span>
    );
  }
  if (state.kind === "attention") {
    return (
      <span className="mt-0.5 text-destructive" title={state.label}>
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{state.label}</span>
      </span>
    );
  }
  if (state.kind === "draft") {
    return (
      <span
        className="mt-0.5 text-amber-600 dark:text-amber-400"
        title={state.label}
      >
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">{state.label}</span>
      </span>
    );
  }
  return (
    <span className="mt-0.5 text-muted-foreground" title={state.label}>
      <PauseCircle className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{state.label}</span>
    </span>
  );
}

function CustomConnectorCard({
  onNavigate,
}: {
  onNavigate: (href: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="listitem"
      data-app-slug="custom-mcp"
      className="overflow-hidden rounded-xl border border-border"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Link2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            {tNewUi("newUi.k89af50f90908")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tNewUi("newUi.kb1e889797cee")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          aria-controls="custom-connector-options"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? tNewUi("newUi.k7d9eb7acb13e") : tNewUi("newUi.k1a2303ede074")}
        </Button>
      </div>

      {expanded ? (
        <div
          id="custom-connector-options"
          className="grid gap-2 border-t border-border px-4 py-3 sm:grid-cols-2"
        >
          <CustomConnectorOption
            icon={ServerCog}
            title={tNewUi("newUi.kabb2409de6f9")}
            description={tNewUi("newUi.ka5d7497c1aed")}
            onClick={() => onNavigate("/apps/byo")}
          />
          <CustomConnectorOption
            icon={ClipboardPaste}
            title={tNewUi("newUi.k27261473ca27")}
            description={tNewUi("newUi.k3c42052adf05")}
            onClick={() => onNavigate("/apps/advanced/paste-config")}
          />
        </div>
      ) : null}
    </div>
  );
}

function CustomConnectorOption({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof ServerCog;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-3 rounded-lg border border-border px-3 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent/40"
      onClick={onClick}
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
