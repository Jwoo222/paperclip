import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ChatEndpointSetupState } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import {
  chatEndpointsApi,
  type ChatEndpoint,
  type ChatEndpointResource,
} from "@/api/chatEndpoints";
import {
  githubChatApi,
  type GitHubConfigurationRecord,
  type GitHubIdentity,
  type GitHubVerification,
} from "@/api/githubChat";
import { AgentSelect } from "@/components/AgentMultiSelect";
import { GitHubAgentTrustWarning } from "@/components/GitHubAgentTrustWarning";
import { GitHubSetupPrompt } from "./GitHubSetupPrompt";
import {
  SetupWizardNavigation,
  SetupWizardFooter,
} from "@/components/SetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/ToastContext";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useNavigate, useSearchParams, Link } from "@/lib/router";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  GitHubAccessEditor,
  GitHubPolicyEditor,
  GitHubToggle,
  githubSelectClass,
} from "./GitHubBotConfiguration";

const steps = [
  tNewUi("newUi.kf7c0bf69c3cf"),
  tNewUi("newUi.k202c68504eed"),
  tNewUi("newUi.k58a34c9573cf"),
  tNewUi("newUi.k09a38d04396b"),
  tNewUi("newUi.k162108e5bba3"),
  tNewUi("newUi.k24fa20ced6cc"),
  tNewUi("newUi.ka5b6ad062326"),
  tNewUi("newUi.kfe6951113784"),
];
const stages: NonNullable<ChatEndpointSetupState["github"]>["stage"][] = [
  "connect",
  "connect",
  "install",
  "repositories",
  "verify",
  "identity",
  "behavior",
  "test",
];
export function GitHubChatSetup() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [secretCopy, setSecretCopy] = useState<"idle" | "copied" | "failed">("idle");
  const identityOnly = params.get("stage") === "identity";
  const reconnecting = params.get("reconnect") === "1";
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [endpoint, setEndpoint] = useState<ChatEndpoint | null>(null);
  const [agentId, setAgentId] = useState(params.get("agentId") ?? "");
  const [step, setStep] = useState(0);
  const [availableStep, setAvailableStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("Paperclip Review");
  const [existing, setExisting] = useState(reconnecting);
  const [credentials, setCredentials] = useState({
    appId: "",
    privateKey: "",
    webhookSecret: "",
  });
  const [registration, setRegistration] = useState<Awaited<
    ReturnType<typeof githubChatApi.registration>
  > | null>(null);
  const [resources, setResources] = useState<ChatEndpointResource[]>([]);
  const [record, setRecord] = useState<GitHubConfigurationRecord | null>(null);
  const [verification, setVerification] = useState<GitHubVerification | null>(
    null,
  );
  const [personalConnectionId, setPersonalConnectionId] = useState("");
  const [identity, setIdentity] = useState<GitHubIdentity | null>(null);
  const [copied, setCopied] = useState(false);
  const resume = params.get("resume");
  const agents = useQuery({
    queryKey: ["github-setup-agents", selectedCompanyId],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && !identityOnly,
  });
  const current = useQuery({
    queryKey: ["github-setup", resume],
    queryFn: () => chatEndpointsApi.get(resume!),
    enabled: !!resume,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });
  const accounts = useQuery({
    queryKey: ["github-personal-connections", endpoint?.id],
    queryFn: () => githubChatApi.personalConnections(endpoint!.id),
    enabled: !!endpoint && step === 5,
  });
  const test = useQuery({
    queryKey: ["github-test-status", endpoint?.id],
    queryFn: () => chatEndpointsApi.setupTestStatus(endpoint!.id),
    enabled: !!endpoint && step === 7,
    refetchInterval: 3000,
  });
  const selectedAgent = agents.data?.find((agent) => agent.id === agentId);
  useEffect(() => {
    setBreadcrumbs([
      { label: tNewUi("newUi.kc3d2e79ebdd0"), href: "/apps" },
      { label: tNewUi("newUi.kbb04a7251ca1") },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);
  useEffect(() => {
    if (!current.data) return;
    setEndpoint(current.data);
    setAgentId(current.data.assignedAgentId);
    if (availableStep === 0) {
      const next = identityOnly
        ? 5
        : reconnecting
          ? 1
          : current.data.setup?.github?.stage
            ? Math.max(1, stages.indexOf(current.data.setup.github.stage))
            : current.data.status === "active"
              ? 6
              : 1;
      setStep(next);
      setAvailableStep(next);
      if (identityOnly) return;
      void Promise.all([
        chatEndpointsApi.listResources(current.data.id),
        githubChatApi.configuration(current.data.id),
      ])
        .then(([resources, config]) => {
          setResources(resources);
          setRecord(config);
        })
        .catch((error) =>
          setError(
            error instanceof Error ? error.message : tNewUi("newUi.kf5af31879be9"),
          ),
        );
    }
  }, [current.data, availableStep, params]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : tNewUi("newUi.k5dea592f6539"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function go(next: number, bot = endpoint) {
    if (bot && next > 0)
      setEndpoint(await githubChatApi.progress(bot.id, stages[next]!));
    setStep(next);
    setAvailableStep((value) => Math.max(value, next));
  }
  async function saveConfiguration() {
    if (!endpoint || !record) return;
    const saved = await githubChatApi.save(
      endpoint.id,
      record.revision,
      record.configuration,
    );
    setRecord(saved);
  }
  const exit = () =>
    void run(async () => {
      if (step === 6) await saveConfiguration();
      if (endpoint && step > 0 && !identityOnly)
        await githubChatApi.progress(endpoint.id, stages[step]!);
      navigate("/apps");
    });
  const footer = (
    label: string,
    action: () => Promise<void>,
    disabled = false,
    extra?: React.ReactNode,
  ) => (
    <SetupWizardFooter onSaveExit={exit}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {step > 0 && !identityOnly && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setStep(step - 1)}
          >
            {t("skillStudio.back")}
          </Button>
        )}
        {extra}
        <Button disabled={busy || disabled} onClick={() => void run(action)}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          {label}
        </Button>
      </div>
    </SetupWizardFooter>
  );
  const publicHttps = !!endpoint?.setup?.webhookUrl?.startsWith("https://");
  const mention = `@${endpoint?.botUsername?.replace(/\[bot\]$/, "") ?? "your-bot"} review this pull request`;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <SetupWizardNavigation
        labels={identityOnly ? [tNewUi("newUi.k24fa20ced6cc")] : steps}
        step={identityOnly ? 0 : step}
        availableStep={identityOnly ? 0 : availableStep}
        onSelect={identityOnly ? () => {} : setStep}
        disabled={busy}
        takeover
      />
      <div>
        <p className="text-xs text-muted-foreground">
          {identityOnly
            ? tNewUi("newUi.k0b21237034e6")
            : `GitHub bot · Step ${step + 1} of ${steps.length}`}
        </p>
        <h1 className="mt-2 text-2xl font-semibold">{steps[step]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tNewUi("newUi.k337de2fdb65d")}
        </p>
      </div>
      {(error || current.error || agents.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
        >
          {error || tNewUi("newUi.k99dc51ba3fc1")}
        </p>
      )}
      {step === 0 && (
        <>
          <GitHubSetupPrompt />
          <p className="text-sm">
            {tNewUi("newUi.k8cacf15c3a61")}
          </p>
          {endpoint ? (
            <Input
              aria-label={tNewUi("newUi.kf96135acf40c")}
              value={
                endpoint.assignedAgentName ?? selectedAgent?.name ?? agentId
              }
              readOnly
            />
          ) : (
            <AgentSelect
              agents={(agents.data ?? []).filter(
                (agent) => !["terminated", "archived"].includes(agent.status),
              )}
              value={agentId}
              onChange={setAgentId}
              placeholder={tNewUi("newUi.kb6890bc23a9c")}
              emptyMessage={tNewUi("newUi.kda9108359944")}
            />
          )}
          <GitHubAgentTrustWarning agent={selectedAgent} />
          {footer(
            tNewUi("newUi.k31fbef162594"),
            async () => {
              const bot =
                endpoint ??
                (await chatEndpointsApi.create(selectedCompanyId!, {
                  provider: "github",
                  assignedAgentId: agentId,
                }));
              setEndpoint(bot);
              setParams(
                { provider: "github", resume: bot.id },
                { replace: true },
              );
              setRecord(await githubChatApi.configuration(bot.id));
              await go(1, bot);
            },
            !agentId || !selectedCompanyId,
          )}
        </>
      )}
      {step === 1 && endpoint && (
        <>
          {!publicHttps && (
            <div
              role="alert"
              className="rounded-lg border border-(--status-task-todo)/30 bg-(--status-task-todo)/10 p-4 text-sm"
            >
              {tNewUi("newUi.k303a37fb3dff")} {" "}
              <a className="underline" href="https://docs.paperclip.ing/reference/deploy/https/" target="_blank" rel="noreferrer">{tNewUi("newUi.kd73f790b1709")}</a>
            </div>
          )}
          <p className="text-sm">
            {tNewUi("newUi.k3f4496e97d78")}{" "}
            {selectedAgent?.name ?? endpoint.assignedAgentName}{tNewUi("newUi.k4d0eb64f7e72")}
          </p>
          {reconnecting && (
            <p className="text-sm text-muted-foreground">
              {tNewUi("newUi.k216b193f09f4")}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant={!existing ? "default" : "outline"}
              onClick={() => setExisting(false)}
            >
              {tNewUi("newUi.kee0d795261a1")}
            </Button>
            <Button
              variant={existing ? "default" : "outline"}
              onClick={() => setExisting(true)}
            >
              {tNewUi("newUi.k49f3af520993")}
            </Button>
          </div>
          {existing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github-app-id">{tNewUi("newUi.k3c2f1e20ab37")}</Label>
                <Input
                  id="github-app-id"
                  value={credentials.appId}
                  onChange={(e) =>
                    setCredentials({ ...credentials, appId: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {tNewUi("newUi.k206851925fe5")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-private-key">{t("settingsSecurity.privateKey")}</Label>
                <Textarea
                  id="github-private-key"
                  autoComplete="off"
                  value={credentials.privateKey}
                  onChange={(e) =>
                    setCredentials({
                      ...credentials,
                      privateKey: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {tNewUi("newUi.k618c80b1b277")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-webhook-secret">{t("routinesRound2.editor.webhookSecret")}</Label>
                <Input
                  id="github-webhook-secret"
                  type="password"
                  autoComplete="off"
                  value={credentials.webhookSecret}
                  onChange={(e) =>
                    setCredentials({
                      ...credentials,
                      webhookSecret: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {tNewUi("newUi.k92781553dbb3")}
                </p>
                {!reconnecting && <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
                    const generated = await chatEndpointsApi.generateSetupSecret(endpoint.id);
                    setCredentials(current => ({ ...current, webhookSecret: generated.webhookSecret }));
                    setSecretCopy("idle");
                  })}>{tNewUi("newUi.kcfbc14dea167")}</Button>
                  {credentials.webhookSecret && <Button variant="outline" onClick={async () => {
                    try { await copyTextToClipboard(credentials.webhookSecret); setSecretCopy("copied"); }
                    catch { setSecretCopy("failed"); pushToast({ title: tNewUi("newUi.k72ff542bf8a7"), body: tNewUi("newUi.kd630d4829b08"), tone: "error" }); }
                  }}>{secretCopy === "copied" ? tNewUi("newUi.k444c369db768") : secretCopy === "failed" ? tNewUi("newUi.k368f602dd21e") : tNewUi("newUi.ka6635b8ce037")}</Button>}
                </div>}

              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label htmlFor="github-app-name">{tNewUi("newUi.k0647b10c34c0")}</Label>
              <Input
                id="github-app-name"
                maxLength={34}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setRegistration(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {tNewUi("newUi.k48c853394204")}
              </p>
              {registration && (
                <form
                  action={registration.registrationUrl}
                  method="POST"
                >
                  <input
                    type="hidden"
                    name="manifest"
                    value={JSON.stringify(registration.manifest)}
                  />
                  <Button type="submit">
                    {tNewUi("newUi.k1536e05c961e")}
                    <ExternalLink className="ml-2 size-4" />
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tNewUi("newUi.k6afb9390fe17")}{" "}
                    {new Date(registration.expiresAt).toLocaleTimeString()}.
                  </p>
                </form>
              )}
            </div>
          )}
          <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm">
              {tNewUi("newUi.ka84eb7a10ee7")}
            </summary>
            <p className="mt-3 text-sm">
              {tNewUi("newUi.k6b86b20a102d")}
            </p>
            <p className="mt-2 break-all text-xs">
              {endpoint.setup?.webhookUrl ?? tNewUi("newUi.k58d73158cc93")}
            </p>
            {endpoint.setup?.webhookUrl && <Button variant="outline" size="sm" className="mt-2" onClick={() => void run(async () => { await copyTextToClipboard(endpoint.setup!.webhookUrl!); pushToast({ title: tNewUi("newUi.k10a93657c960"), tone: "success" }); })}>{tNewUi("newUi.k69179edf1639")}</Button>}
            {registration && (
              <pre className="mt-3 overflow-auto text-xs">
                {JSON.stringify(registration.manifest, null, 2)}
              </pre>
            )}
          </details>
          {footer(
            reconnecting
              ? tNewUi("newUi.ka8271b89da73")
              : endpoint.setup?.github?.appSlug
                ? tNewUi("newUi.kf57268cc555c")
                : existing
                  ? tNewUi("newUi.kf4ea27b929c2")
                  : tNewUi("newUi.k04a99431663c"),
            async () => {
              if (reconnecting) {
                const saved = await chatEndpointsApi.setup(endpoint.id, {
                  action: "reconnect",
                  ...(credentials.privateKey
                    ? {
                        credentials: {
                          appId: credentials.appId || endpoint.botExternalId!,
                          privateKey: credentials.privateKey,
                        },
                      }
                    : {}),
                });
                setEndpoint(saved);
                setCredentials({
                  appId: "",
                  privateKey: "",
                  webhookSecret: "",
                });
                await go(4, saved);
              } else if (endpoint.setup?.github?.appSlug) await go(2);
              else if (existing) {
                const saved = await githubChatApi.connectApp(
                  endpoint.id,
                  credentials,
                );
                setEndpoint(saved);
                setCredentials({
                  appId: "",
                  privateKey: "",
                  webhookSecret: "",
                });
                await go(2, saved);
              } else
                setRegistration(
                  await githubChatApi.registration(endpoint.id, name),
                );
            },
            !publicHttps ||
              (existing &&
                !reconnecting &&
                (!credentials.appId ||
                  !credentials.privateKey ||
                  !credentials.webhookSecret) &&
                !endpoint.setup?.github?.appSlug),
          )}
        </>
      )}
      {step === 2 && endpoint && (
        <>
          <p className="text-sm">
            {tNewUi("newUi.k79227a0faab9")}
          </p>
          <p className="text-sm text-muted-foreground">
            {tNewUi("newUi.k48329a28e64a")}
          </p>
          {endpoint.setup?.github?.installationUrl && (
            <Button asChild>
              <a
                href={endpoint.setup.github.installationUrl}
                target="_blank"
                rel="noreferrer"
              >
                {tNewUi("newUi.ke7d912b5a1bd")}
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          )}
          {footer(tNewUi("newUi.k51f34c03b273"), async () => {
            setResources(await githubChatApi.refreshRepositories(endpoint.id));
            await go(3);
          })}
        </>
      )}
      {step === 3 && endpoint && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setResources(
                    await githubChatApi.refreshRepositories(endpoint.id),
                  );
                  setEndpoint(await chatEndpointsApi.get(endpoint.id));
                })
              }
            >
              <RefreshCw className="mr-2 size-4" />
              {tNewUi("newUi.k0df81b589318")}
            </Button>
            <Button variant="outline" asChild>
              <a
                href={
                  endpoint.setup?.github?.managementUrl ??
                  "https://github.com/settings/installations"
                }
                target="_blank"
                rel="noreferrer"
              >
                {tNewUi("newUi.ke9f56cc327be")}
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {tNewUi("newUi.kf90514488a3a")}
          </p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {resources.length === 0 && (
              <p className="p-4 text-sm">
                {tNewUi("newUi.kc5b748d958d2")}
              </p>
            )}
            {resources.map((resource) => (
              <div key={resource.id} className="p-4">
                <GitHubToggle
                  label={resource.label}
                  description={
                    resource.availability !== "available"
                      ? tNewUi("newUi.kbe83c8686101")
                      : tNewUi("newUi.k343c9809a98b")
                  }
                  checked={
                    resource.enabled && resource.availability === "available"
                  }
                  onChange={(enabled) =>
                    setResources(
                      resources.map((row) =>
                        row.id === resource.id
                          ? {
                              ...row,
                              enabled:
                                enabled && row.availability === "available",
                            }
                          : row,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          {footer(
            tNewUi("newUi.kbfc166c22b41"),
            async () => {
              await chatEndpointsApi.updateResources(
                endpoint.id,
                resources.map((resource) => ({
                  id: resource.id,
                  enabled: resource.enabled,
                })),
              );
              await chatEndpointsApi.update(endpoint.id, {
                allowGroupChats: true,
              });
              const configured = await chatEndpointsApi.setup(endpoint.id, {
                action:
                  endpoint.status === "draft" || endpoint.status === "attention"
                    ? "configure"
                    : "reconnect",
              });
              setEndpoint(configured);
              await go(4, configured);
            },
            !resources.some(
              (resource) =>
                resource.enabled && resource.availability === "available",
            ),
          )}
        </>
      )}
      {step === 4 && endpoint && (
        <>
          <p className="text-sm">
            {tNewUi("newUi.k05ca3a61cb4c")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  setVerification(await githubChatApi.verify(endpoint.id)),
                )
              }
            >
              {tNewUi("newUi.k7b840072a1e4")}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !record}
              onClick={() =>
                void run(async () => {
                  if (!record) return;
                  setRecord(
                    await githubChatApi.save(endpoint.id, record.revision, {
                      ...record.configuration,
                      toolsEnabled: true,
                    }),
                  );
                  setVerification(await githubChatApi.verify(endpoint.id));
                })
              }
            >
              {tNewUi("newUi.k4a3084250351")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tNewUi("newUi.k5e9969b1903b")}
          </p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {verification?.checks.map((check) => (
              <div key={check.key} className="flex gap-3 p-4">
                {check.ok ? (
                  <CheckCircle2 className="mt-1 size-4 shrink-0 text-(--status-task-done)" />
                ) : (
                  <XCircle className="mt-1 size-4 shrink-0 text-destructive" />
                )}
                <div>
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {check.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <GitHubAgentTrustWarning agent={selectedAgent} />
          {footer(tNewUi("newUi.k31fbef162594"), () => go(5), !verification?.ready)}
        </>
      )}
      {step === 5 && endpoint && (
        <>
          <p className="text-sm">
            {tNewUi("newUi.k05d580dd7af2")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="github-personal-account">
              {tNewUi("newUi.kb6eb02e7e169")}
            </Label>
            <select
              id="github-personal-account"
              className={githubSelectClass}
              value={personalConnectionId}
              onChange={(e) => {
                setPersonalConnectionId(e.target.value);
                setIdentity(null);
              }}
            >
              <option value="">{tNewUi("newUi.k323b061e63fe")}</option>
              {accounts.data?.map((account) => (
                <option
                  key={account.connectionId}
                  value={account.connectionId}
                  disabled={!account.enabled || account.status !== "active"}
                >
                  {account.name}
                  {account.login ? ` · @${account.login}` : ""}
                  {account.status !== "active" ? tNewUi("newUi.k6023b4fb7e75") : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {tNewUi("newUi.k88560962696d")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!personalConnectionId || busy}
              onClick={() =>
                void run(async () =>
                  setIdentity(
                    await githubChatApi.identity(
                      endpoint.id,
                      personalConnectionId,
                    ),
                  ),
                )
              }
            >
              {tNewUi("newUi.k8540f4dee735")}
            </Button>
            <Button variant="ghost" onClick={() => void accounts.refetch()}>
              {tNewUi("newUi.kcad52835e0c2")}
            </Button>
            <Link className="self-center text-sm underline" to="/apps/connect?source=github">
              {tNewUi("newUi.k4027e5b24418")}
            </Link>
          </div>
          {accounts.error && (
            <p role="alert" className="text-sm text-destructive">
              {tNewUi("newUi.k9f7fb23924ff")}
            </p>
          )}
          {identity && (
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium">@{identity.login}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tNewUi("newUi.k13f319d72ca1")} {identity.githubUserId}{tNewUi("newUi.kd9ba84f93ef6")}
              </p>
            </div>
          )}
          {footer(
            tNewUi("newUi.k8785dba3fb3b"),
            async () => {
              await githubChatApi.identity(
                endpoint.id,
                personalConnectionId,
                identity!.githubUserId,
              );
              if (identityOnly) navigate("/apps");
              else await go(6);
            },
            !identity,
          )}
        </>
      )}
      {step === 6 && endpoint && record && (
        <>
          <GitHubAccessEditor
            endpointId={endpoint.id}
            companyId={endpoint.companyId}
            configuration={record.configuration}
            onChange={(configuration) =>
              setRecord({ ...record, configuration })
            }
          />
          <GitHubPolicyEditor
            policy={record.configuration.defaults}
            onChange={(defaults) =>
              setRecord({
                ...record,
                configuration: { ...record.configuration, defaults },
              })
            }
          />
          {footer(tNewUi("newUi.k3c632a6926f4"), async () => {
            await saveConfiguration();
            await go(7);
          })}
        </>
      )}
      {step === 7 && endpoint && (
        <>
          <p className="text-sm">
            {tNewUi("newUi.k5a3a82e59eb1")}{" "}
            {selectedAgent?.name ?? endpoint.assignedAgentName} {tNewUi("newUi.k6ece0525b621")}
          </p>
          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
            <code className="min-w-0 flex-1 break-all text-sm">{mention}</code>
            <Button
              variant="ghost"
              size="icon"
              aria-label={tNewUi("newUi.ke2d09d427240")}
              onClick={() =>
                void copyTextToClipboard(mention).then(() => setCopied(true))
              }
            >
              <Copy className="size-4" />
            </Button>
          </div>
          {copied && (
            <p role="status" className="text-xs text-muted-foreground">
              {tNewUi("newUi.k84071487fe40")}
            </p>
          )}
          <p role="status" className="text-sm">
            {test.data?.messageReceivedAt
              ? tNewUi("newUi.k3f5a8a9688cb")
              : tNewUi("newUi.k4739b5e8071b")}
          </p>
          <Link
            className="text-sm underline"
            to={`/apps/chat/${endpoint.id}/conversations`}
          >
            {tNewUi("newUi.k29b288a502fb")}
          </Link>
          {footer(
            tNewUi("newUi.k8de2344278fb"),
            async () => {
              await chatEndpointsApi.test(endpoint.id);
              navigate(`/apps/chat/${endpoint.id}/settings`);
            },
            !test.data?.messageReceivedAt,
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await chatEndpointsApi.finishSlackSetup(endpoint.id);
                  navigate(`/apps/chat/${endpoint.id}/settings`);
                })
              }
            >
              {tNewUi("newUi.k75641f72beb6")}
            </Button>,
          )}
        </>
      )}
    </div>
  );
}
