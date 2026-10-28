import { useState } from "react";
import { AlertTriangle, CircleHelp, ExternalLink, Loader2 } from "lucide-react";
import type { ChatEndpoint } from "@/api/chatEndpoints";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { CopyText } from "@/components/CopyText";
import { SetupWizardFooter } from "@/components/SetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/lib/router";
import { gitHubAppSettingsUrl } from "./GitHubAppIdentity";
import { t } from "@/i18n";

export function GitHubConnectionRecoveryNotice({ endpoint }: { endpoint: ChatEndpoint }) {
  if (!["attention", "revoked"].includes(endpoint.status)) return null;
  return (
    <section aria-label={t("upgrade1029NewPages.githubRecovery.needsRepair")} className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 space-y-3">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{endpoint.status === "revoked" ? t("upgrade1029NewPages.githubRecovery.botDisconnected") : t("upgrade1029NewPages.githubRecovery.needsRepair")}</h2>
          <p className="text-sm">{t("upgrade1029NewPages.githubRecovery.reconnectHelp")}</p>
        </div>
        <Button asChild><Link to={`/apps/chat/connect?provider=github&resume=${endpoint.id}&reconnect=1`}>{t("upgrade1029NewPages.githubRecovery.reconnectGitHub")}</Link></Button>
        {(endpoint.lastError || endpoint.healthMessage) && <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.connectionDetails")}</summary>
          <p className="mt-2 break-words">{endpoint.lastError ?? endpoint.healthMessage}</p>
        </details>}
      </div>
    </section>
  );
}

export const GITHUB_APP_CREDENTIAL_FIELDS = ["privateKey", "webhookSecret", "clientSecret"] as const;
export type GitHubAppCredentialField = typeof GITHUB_APP_CREDENTIAL_FIELDS[number];
export type GitHubAppCredentials = { appId: string; privateKey: string; webhookSecret: string; clientSecret?: string };

function CredentialLabel({ id, label, help }: { id: string; label: string; help: string }) {
  return <div className="flex items-center gap-1.5">
    <Label htmlFor={id}>{label}</Label>
    <Tooltip><TooltipTrigger asChild><button type="button" aria-label={t("upgrade1029NewPages.githubRecovery.helpWith", { label })} className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      <CircleHelp className="size-3.5" aria-hidden="true" />
    </button></TooltipTrigger><TooltipContent className="max-w-xs">{help}</TooltipContent></Tooltip>
  </div>;
}

export function GitHubAppRecovery({ endpoint, reconnect, credentialFields, requireAllCredentialFields = false, rotateWebhookSecret = false, rotationAlreadyCommitted = false, onConnect, onExit }: {
  endpoint: ChatEndpoint;
  reconnect: boolean;
  credentialFields?: readonly GitHubAppCredentialField[];
  requireAllCredentialFields?: boolean;
  rotateWebhookSecret?: boolean;
  rotationAlreadyCommitted?: boolean;
  onConnect: (credentials?: GitHubAppCredentials) => Promise<void>;
  onExit: () => void;
}) {
  const [replace, setReplace] = useState(!!credentialFields || !reconnect);
  const [credentials, setCredentials] = useState<GitHubAppCredentials>({ appId: endpoint.botExternalId ?? "", privateKey: "", webhookSecret: "" });
  const [privateKeyDraft, setPrivateKeyDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fileError, setFileError] = useState("");
  const [rotationSecret, setRotationSecret] = useState("");
  const [rotationGeneration, setRotationGeneration] = useState<string | null>(null);
  const [rotationUncertain, setRotationUncertain] = useState(false);
  const needsPrivateKey = !credentialFields || credentialFields.includes("privateKey");
  const needsWebhookSecret = credentialFields ? credentialFields.includes("webhookSecret") : !reconnect && !["active", "paused", "revoked"].includes(endpoint.status);
  const appName = endpoint.botLabel ?? endpoint.setup?.github?.appName ?? t("upgrade1029NewPages.githubRecovery.yourExistingApp");
  const appIdInvalid = !!credentials.appId.trim() && !/^\d+$/.test(credentials.appId.trim());
  const keyInvalid = !!credentials.privateKey.trim() && !/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(credentials.privateKey);
  const keyLoaded = !!credentials.privateKey.trim() && !keyInvalid && !privateKeyDraft;
  const incomplete = credentialFields
    ? !credentialFields.length || appIdInvalid || keyInvalid || (requireAllCredentialFields
      ? credentialFields.some(field => !credentials[field]?.trim())
      : credentialFields.every(field => !credentials[field]?.trim()))
    : replace && (!credentials.appId.trim() || !credentials.privateKey.trim() || appIdInvalid || keyInvalid || (needsWebhookSecret && !credentials.webhookSecret.trim()));
  const actionLabel = pending ? t("upgrade1029NewPages.githubRecovery.checkingGitHub") : replace ? (reconnect ? t("upgrade1029NewPages.githubRecovery.verifyAndReconnect") : t("upgrade1029NewPages.githubRecovery.connectExistingApp")) : t("upgrade1029NewPages.githubRecovery.reconnectSavedApp");
  async function connect() {
    setPending(true);
    setError("");
    try { await onConnect(replace ? credentials : undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("upgrade1029NewPages.githubRecovery.reconnectFailed")); }
    finally { setPending(false); }
  }
  async function checkSavedRotation(expected: string | null | undefined) {
    try {
      const saved = await chatEndpointsApi.get(endpoint.id);
      if (expected !== undefined && (saved.setup?.credentialRotationId ?? null) === expected) {
        setRotationUncertain(false);
        return true;
      }
      setRotationSecret("");
      setRotationGeneration(null);
      setError(t("upgrade1029NewPages.githubRecovery.secretNotReceived"));
    } catch {
      // A failed status read cannot establish that the earlier secret is current.
    }
    setRotationUncertain(true);
    return false;
  }
  async function generateSecret() {
    const previousGeneration = rotationGeneration ?? (rotationSecret ? undefined : endpoint.setup?.credentialRotationId ?? null);
    setPending(true);
    setError("");
    try {
      const result = await chatEndpointsApi.generateSetupSecret(endpoint.id);
      setRotationSecret(result.webhookSecret);
      setRotationGeneration(result.credentialRotationId ?? null);
      setRotationUncertain(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("upgrade1029NewPages.githubRecovery.generateFailed"));
      setRotationUncertain(true);
      await checkSavedRotation(previousGeneration);
    }
    finally { setPending(false); }
  }
  return <div className="space-y-6">
    {reconnect && <div className="space-y-3">
      <p className="text-sm">{t("upgrade1029NewPages.githubRecovery.restorePrefix")}<strong>{appName}</strong>{t("upgrade1029NewPages.githubRecovery.restoreSuffix")}</p>
      <p className="text-sm text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.historyStays")}</p>
    </div>}
    {rotateWebhookSecret && <section aria-label={t("upgrade1029NewPages.githubRecovery.rotateAria")} className="space-y-3">
      <h2 className="text-base font-semibold">{t("upgrade1029NewPages.githubRecovery.rotateTitle")}</h2>
      <p className="text-sm">{rotationAlreadyCommitted ? t("upgrade1029NewPages.githubRecovery.rotatedSaved") : <>{t("upgrade1029NewPages.githubRecovery.rotatePrefix")}<a href={gitHubAppSettingsUrl(endpoint)} target="_blank" rel="noreferrer" className="underline">{t("upgrade1029NewPages.githubRecovery.appSettingsLink")}</a>{t("upgrade1029NewPages.githubRecovery.rotateSuffix")}</>}</p>
      <p className="text-sm text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.rotateWarning")}</p>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void generateSecret()}>{rotationSecret || rotationAlreadyCommitted ? t("upgrade1029NewPages.githubRecovery.generateAnother") : t("upgrade1029NewPages.githubRecovery.generateSecretLabel")}</Button>
      {rotationUncertain && <p role="status" className="text-sm">{t("upgrade1029NewPages.githubRecovery.notConfirmed")}</p>}
      {rotationUncertain && rotationSecret && <Button type="button" variant="outline" disabled={pending} onClick={async () => {
        setPending(true);
        try { if (await checkSavedRotation(rotationGeneration ?? undefined)) setError(""); }
        finally { setPending(false); }
      }}>{t("upgrade1029NewPages.githubRecovery.checkSavedStatus")}</Button>}
      {rotationSecret && !rotationUncertain && <div className="space-y-2">
        <Label htmlFor="github-rotation-secret">{t("upgrade1029NewPages.githubRecovery.newWebhookSecretLabel")}</Label>
        <Input id="github-rotation-secret" type="password" autoComplete="off" disabled={pending} readOnly value={rotationSecret} />
        {!pending && <CopyText text={rotationSecret} ariaLabel={t("upgrade1029NewPages.githubRecovery.copyWebhookSecretLabel")} className="text-sm underline">{t("upgrade1029NewPages.githubRecovery.copyWebhookSecretLabel")}</CopyText>}
      </div>}
    </section>}
    {error && <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium">{rotateWebhookSecret ? t("upgrade1029NewPages.githubRecovery.rotationFailed") : replace ? t("upgrade1029NewPages.githubRecovery.reconnectAppFailed") : t("upgrade1029NewPages.githubRecovery.reconnectSavedFailed")}</p>
      <p className="break-words">{error}</p>
      <p>{rotateWebhookSecret ? t("upgrade1029NewPages.githubRecovery.rotationFailedHelp") : t("upgrade1029NewPages.githubRecovery.reconnectFailedHelp")}</p>
    </div>}
    {reconnect && !rotateWebhookSecret && !credentialFields && <Button variant="link" className="h-auto p-0" disabled={pending} onClick={() => { setReplace(!replace); setError(""); }}>
      {replace ? t("upgrade1029NewPages.githubRecovery.useSaved") : t("upgrade1029NewPages.githubRecovery.replaceCredentials")}
    </Button>}
    {replace && <div className="space-y-6">
      <div className="space-y-2 text-sm">
        <h2 className="text-base font-semibold">{reconnect ? t("upgrade1029NewPages.githubRecovery.replaceForSameApp") : t("upgrade1029NewPages.githubRecovery.connectYourExisting")}</h2>
        <p><a href={gitHubAppSettingsUrl(endpoint)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{t("newUi.k1395525a0077")}<ExternalLink className="size-3.5" /></a>{t("upgrade1029NewPages.githubRecovery.andChoose")}<strong>{appName}</strong>{t("upgrade1029NewPages.githubRecovery.chooseEnd")}</p>
        <p className="text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.orgOwned")}</p>
        {credentialFields && <p className="text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.enterRequested")}</p>}
      </div>
      {needsPrivateKey && <div className="space-y-2">
        <CredentialLabel id="github-app-id" label="App ID" help={t("upgrade1029NewPages.githubRecovery.appIdHelp")} />
        <p id="github-app-id-help" className="text-sm text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.copyPrefix")}<strong>App ID</strong>{t("upgrade1029NewPages.githubRecovery.copySuffix")}{reconnect && t("upgrade1029NewPages.githubRecovery.savedIdFilled")}</p>
        <Input id="github-app-id" aria-describedby="github-app-id-help" inputMode="numeric" value={credentials.appId} disabled={pending} aria-invalid={appIdInvalid} onChange={event => setCredentials({ ...credentials, appId: event.target.value })} />
        {appIdInvalid && <p role="alert" className="text-sm text-destructive">{t("upgrade1029NewPages.githubRecovery.appIdInvalid")}</p>}
      </div>}
      {needsPrivateKey && <div className="space-y-2">
        <CredentialLabel id="github-private-key" label={t("environmentsExtra.privateKey")} help={t("upgrade1029NewPages.githubRecovery.privateKeyHelp")} />
        <ol id="github-private-key-help" className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("upgrade1029NewPages.githubRecovery.keyStep1Prefix")}<strong>Credentials → Key pairs → New key</strong>{t("upgrade1029NewPages.githubRecovery.keyStep1Middle")}<strong>Private keys → Generate a private key</strong>{t("upgrade1029NewPages.githubRecovery.keyStep1End")}</li>
          <li>{t("upgrade1029NewPages.githubRecovery.keyStep2Prefix")}<strong>.pem</strong>{t("upgrade1029NewPages.githubRecovery.keyStep2Suffix")}</li>
        </ol>
        <p className="text-sm text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.reusePem")}</p>
        <Input type="file" accept=".pem" aria-label={t("upgrade1029NewPages.githubRecovery.uploadPemAria")} disabled={pending} onChange={async event => {
          const file = event.target.files?.[0];
          if (!file) return;
          setFileError("");
          try {
            const privateKey = await file.text();
            setCredentials(current => ({ ...current, privateKey }));
            setPrivateKeyDraft("");
          } catch { setFileError(t("upgrade1029NewPages.githubRecovery.readFileFailed")); }
        }} />
        <Input id="github-private-key" type="password" autoComplete="off" placeholder={keyLoaded ? t("upgrade1029NewPages.githubRecovery.pasteReplacement") : t("upgrade1029NewPages.githubRecovery.orPaste")} aria-describedby="github-private-key-help" disabled={pending} value={privateKeyDraft} aria-invalid={keyInvalid}
          onPaste={event => { event.preventDefault(); setCredentials({ ...credentials, privateKey: event.clipboardData.getData("text") }); setPrivateKeyDraft(""); setFileError(""); }}
          onChange={event => { setPrivateKeyDraft(event.target.value); setCredentials({ ...credentials, privateKey: event.target.value }); }} />
        {keyLoaded && <p role="status" className="text-sm">{t("upgrade1029NewPages.githubRecovery.keyLoaded")}</p>}
        {keyInvalid && <p role="alert" className="text-sm text-destructive">{t("upgrade1029NewPages.githubRecovery.keyInvalid")}</p>}
        {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
        <a className="inline-flex items-center gap-1 text-sm underline" href="https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps" target="_blank" rel="noreferrer">{t("upgrade1029NewPages.githubRecovery.privateKeyDocs")}<ExternalLink className="size-3.5" /></a>
      </div>}
      {needsWebhookSecret && <div className="space-y-2">
        <CredentialLabel id="github-webhook-secret" label={t("upgrade1029NewPages.githubRecovery.webhookSecretLabel")} help={t("upgrade1029NewPages.githubRecovery.webhookSecretHelp")} />
        <p className="text-sm text-muted-foreground">{t("upgrade1029NewPages.githubRecovery.webhookSecretBody")}</p>
        <Input id="github-webhook-secret" type="password" autoComplete="off" disabled={pending} value={credentials.webhookSecret} onChange={event => setCredentials({ ...credentials, webhookSecret: event.target.value })} />
      </div>}
      {credentialFields?.includes("clientSecret") && <div className="space-y-2">
        <CredentialLabel id="github-client-secret" label={t("upgrade1029NewPages.githubRecovery.clientSecretLabel")} help={t("upgrade1029NewPages.githubRecovery.clientSecretHelp")} />
        <Input id="github-client-secret" type="password" autoComplete="off" disabled={pending} value={credentials.clientSecret ?? ""} onChange={event => setCredentials({ ...credentials, clientSecret: event.target.value })} />
      </div>}
    </div>}
    <SetupWizardFooter onSaveExit={onExit} disabled={pending}>
      <Button aria-label={actionLabel} disabled={pending || incomplete || rotationUncertain || (rotateWebhookSecret && !rotationSecret && !rotationAlreadyCommitted)} onClick={() => void connect()}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        <span className="sm:hidden" aria-hidden="true">{pending ? t("appsConnect.common.checking") : reconnect ? t("appDetail.actions.reconnect") : t("appsBrowserGateway.connections.connect")}</span>
        <span className="hidden sm:inline" aria-hidden="true">{actionLabel}</span>
      </Button>
    </SetupWizardFooter>
  </div>;
}
