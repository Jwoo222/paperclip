import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_AGENT_OBSERVABILITY_CAPTURE, updateAgentObservabilitySchema, isSameOtlpOrigin,
  type AgentObservabilityCapture, type AgentObservabilitySettings, type AgentObservabilitySettingsResponse,
  type AgentObservabilityTestReceipt, type UpdateAgentObservabilityRequest,
} from "@paperclipai/shared";
import { agentObservabilityApi } from "@/api/agent-observability";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleField } from "@/components/agent-config-primitives";
import { t } from "@/i18n";

type HeaderDraft = { id: number; originalName: string | null; name: string; value: string };
const captureLabels: Array<{ key: keyof AgentObservabilityCapture; labelKey: string }> = [
  { key: "userPrompts", labelKey: "upgrade1029NewComponents.agentObservabilitySettings.captureUserPrompts" },
  { key: "assistantResponses", labelKey: "upgrade1029NewComponents.agentObservabilitySettings.captureAssistantResponses" },
  { key: "toolContent", labelKey: "upgrade1029NewComponents.agentObservabilitySettings.captureToolContent" },
  { key: "toolDetails", labelKey: "upgrade1029NewComponents.agentObservabilitySettings.captureToolDetails" },
];
export interface AgentObservabilitySettingsViewProps {
  companyId: string;
  settings: AgentObservabilitySettings | null;
  canManage?: boolean;
  saving?: boolean;
  testing?: boolean;
  removing?: boolean;
  error?: string | null;
  conflict?: boolean;
  result?: AgentObservabilityTestReceipt | null;
  /** Changes only after an explicit successful mutation, never a background refetch. */
  resetKey?: number;
  onSave: (input: UpdateAgentObservabilityRequest) => void;
  onTest: () => void;
  onRemove: () => void;
  onReload?: () => void;
}

export function AgentObservabilitySettingsView(props: AgentObservabilitySettingsViewProps) {
  const { companyId, settings, canManage = true, saving, testing, removing, error, conflict, onSave, onTest, onRemove, onReload } = props;
  const [provider, setProvider] = useState<"braintrust" | "otlp">("braintrust");
  const [projectId, setProjectId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [capture, setCapture] = useState<AgentObservabilityCapture>({ ...DEFAULT_AGENT_OBSERVABILITY_CAPTURE });
  const [apiKey, setApiKey] = useState("");
  const [replaceKey, setReplaceKey] = useState(false);
  const [headers, setHeaders] = useState<HeaderDraft[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [applied, setApplied] = useState<AgentObservabilitySettings | null>(settings);
  const nextHeader = useRef(0);
  const revision = settings?.revision ?? null;
  function reset() {
    setApplied(settings);
    setProvider(settings?.destination.provider ?? "braintrust");
    setProjectId(settings?.destination.provider === "braintrust" ? settings.destination.projectId : "");
    setEndpoint(settings?.destination.provider === "otlp" ? settings.destination.endpointBaseUrl : "");
    setEnabled(settings?.enabled ?? false);
    setCapture({ ...(settings?.capture ?? DEFAULT_AGENT_OBSERVABILITY_CAPTURE) });
    setApiKey(""); setReplaceKey(false); setValidation(null);
    setHeaders((settings?.destination.provider === "otlp" ? settings.headerNames : []).map(name => ({ id: nextHeader.current++, originalName: name, name, value: "" })));
  }
  const original = applied;
  const headersChanged = provider === "otlp" && (headers.some(row => row.value || row.originalName !== row.name.toLowerCase())
    || JSON.stringify(headers.map(row => row.name.toLowerCase()).sort()) !== JSON.stringify(original?.destination.provider === "otlp" ? [...original.headerNames].sort() : []));
  const dirty = !original || provider !== original.destination.provider || enabled !== original.enabled || replaceKey || Boolean(apiKey) || headersChanged
    || JSON.stringify(capture) !== JSON.stringify(original.capture)
    || (provider === "braintrust" ? projectId !== (original.destination.provider === "braintrust" ? original.destination.projectId : "")
      : endpoint !== (original.destination.provider === "otlp" ? original.destination.endpointBaseUrl : ""));
  // Explicit mutation success/company changes erase secrets. Background reads
  // may update a clean form, but cannot overwrite an unsaved draft.
  useEffect(() => { reset(); }, [companyId, props.resetKey]);
  useEffect(() => { if (!dirty && !conflict) reset(); }, [revision]);
  const hasConflict = Boolean(conflict || revision !== (original?.revision ?? null));
  const requireFreshHeaders = provider === "otlp" && original?.destination.provider === "otlp"
    && original.headerNames.length > 0 && !isSameOtlpOrigin(original.destination, { provider: "otlp", endpointBaseUrl: endpoint });
  const busy = saving || testing || removing;
  const providerChanged = !original || original.destination.provider !== provider;
  function save(overrideEnabled?: boolean) {
    if (requireFreshHeaders && headers.some(row => !row.value)) {
      setValidation(t("upgrade1029NewComponents.agentObservabilitySettings.reenterHeaders")); return;
    }
    const common = { expectedRevision: original?.revision ?? null, enabled: overrideEnabled ?? enabled, capture };
    const input = provider === "braintrust"
      ? { ...common, destination: { provider, projectId }, credentials: providerChanged || replaceKey || apiKey || (!original?.credentialsConfigured && common.enabled) ? { mode: "replace", apiKey } : { mode: "keep" } }
      : { ...common, destination: { provider, endpointBaseUrl: endpoint }, credentials: providerChanged || headersChanged || requireFreshHeaders
        ? { mode: "replace", headers: headers.map(row => ({ name: row.name, ...(row.value ? { value: row.value } : {}) })) } : { mode: "keep" } };
    const parsed = updateAgentObservabilitySchema.safeParse(input);
    if (!parsed.success) { setValidation(parsed.error.issues[0]?.message ?? t("upgrade1029NewComponents.agentObservabilitySettings.reviewConfiguration")); return; }
    setValidation(null); onSave(parsed.data);
  }
  const receipt = props.result?.revision === revision ? props.result : settings?.lastTest;
  return <section aria-labelledby="agent-observability-heading" className="max-w-2xl space-y-4">
    <div className="space-y-1">
      <h2 id="agent-observability-heading" className="text-lg font-medium">{t("upgrade1029NewComponents.agentObservabilitySettings.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.description")}</p>
    </div>
    {!canManage ? <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.permissionRequired")}</p> : <>
      <fieldset disabled={busy} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="agent-observability-provider">{t("upgrade1029NewComponents.agentObservabilitySettings.destination")}</Label>
          <select id="agent-observability-provider" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={provider}
            onChange={event => { setProvider(event.target.value as "braintrust" | "otlp"); setApiKey(""); setReplaceKey(false); setValidation(null); }}>
            <option value="braintrust">Braintrust</option><option value="otlp">{t("upgrade1029NewComponents.agentObservabilitySettings.customOtlp")}</option>
          </select>
        </div>
        {provider === "braintrust" ? <>
          <div className="space-y-2"><Label htmlFor="agent-observability-project">{t("newUi.ke511470b21a9")}</Label>
            <Input id="agent-observability-project" value={projectId} onChange={event => setProjectId(event.target.value)} placeholder={t("upgrade1029NewComponents.agentObservabilitySettings.projectPlaceholder")} autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-observability-key">{t("newUi.k16f0ee47f993")}</Label>
            {!providerChanged && original?.credentialsConfigured && !replaceKey ? <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.apiKeyConfigured")}</span><Button type="button" variant="outline" size="sm" onClick={() => setReplaceKey(true)}>{t("upgrade1029NewComponents.agentObservabilitySettings.replaceApiKey")}</Button>
            </div> : <Input id="agent-observability-key" type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" />}
          </div>
        </> : <>
          <div className="space-y-2"><Label htmlFor="agent-observability-endpoint">{t("upgrade1029NewComponents.agentObservabilitySettings.otlpBaseUrl")}</Label>
            <Input id="agent-observability-endpoint" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="https://collector.example.com" autoComplete="off" />
            <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.otlpBaseUrlHint")}</p>
          </div>
          <div className="space-y-2"><div className="flex items-center justify-between gap-3"><Label>{t("newUi.k194e9fe656a1")}</Label>
            <Button type="button" variant="outline" size="sm" disabled={headers.length >= 16} onClick={() => setHeaders(rows => [...rows, { id: nextHeader.current++, originalName: null, name: "", value: "" }])}>{t("newUi.k1192c90dd497")}</Button></div>
            {headers.length === 0 && <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.noHeaders")}</p>}
            {headers.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2">
              <Input className="min-w-0 flex-1" aria-label={t("newUi.kc1dcc8fb31f6")} value={row.name} onChange={event => setHeaders(rows => rows.map(item => item.id === row.id ? { ...item, name: event.target.value } : item))} autoComplete="off" />
              <Input className="min-w-0 flex-1" aria-label={t("upgrade1029NewComponents.agentObservabilitySettings.valueFor", { name: row.name || t("upgrade1029NewComponents.agentObservabilitySettings.headerFallback") })} type="password" value={row.value} placeholder={row.originalName && !requireFreshHeaders ? t("upgrade1029NewComponents.agentObservabilitySettings.keepSavedValue") : t("newUi.kf9a9058c0c22")}
                onChange={event => setHeaders(rows => rows.map(item => item.id === row.id ? { ...item, value: event.target.value } : item))} autoComplete="new-password" />
              <Button type="button" size="sm" variant="ghost" aria-label={t("upgrade1029NewComponents.agentObservabilitySettings.removeNamed", { name: row.name || t("upgrade1029NewComponents.agentObservabilitySettings.headerFallback") })} onClick={() => setHeaders(rows => rows.filter(item => item.id !== row.id))}>{t("adapterTools.adapterManager.remove")}</Button>
            </div>)}
          </div>
        </>}
        <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.credentialsHint")}</p>
        <ToggleField label={t("upgrade1029NewComponents.agentObservabilitySettings.enableExport")} checked={enabled} onChange={setEnabled} hint={t("upgrade1029NewComponents.agentObservabilitySettings.enableExportHint")} />
        <details><summary className="cursor-pointer text-sm font-medium">{t("upgrade1029NewComponents.agentObservabilitySettings.contentCapture")}</summary>
          <div className="space-y-3 pt-3">{captureLabels.map(row => <ToggleField key={row.key} label={t(row.labelKey)} checked={capture[row.key]} onChange={value => setCapture(current => ({ ...current, [row.key]: value }))} />)}
            <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.captureHint")}</p>
          </div>
        </details>
      </fieldset>
      {(validation || error || hasConflict) && <p role="alert" className="text-sm text-destructive">{validation || error || t("upgrade1029NewComponents.agentObservabilitySettings.conflict")}</p>}
      {hasConflict && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { reset(); onReload?.(); }}>{t("upgrade1029NewComponents.agentObservabilitySettings.reloadSaved")}</Button>}
      {!dirty && receipt && <div role="status" className="space-y-1 text-sm">
        <p className="font-medium">{receipt.status === "accepted" ? t("upgrade1029NewComponents.agentObservabilitySettings.testAccepted") : receipt.status === "partial" ? t("upgrade1029NewComponents.agentObservabilitySettings.testPartial") : t("upgrade1029NewComponents.agentObservabilitySettings.testFailed")}</p>
        <p className="text-xs text-muted-foreground">{new Date(receipt.finishedAt).toLocaleString()} · {t("upgrade1029NewComponents.agentObservabilitySettings.sentFromServer")}</p>
        {(["logs", "traces"] as const).map(signal => receipt.signals[signal].message && <p key={signal}>{signal === "logs" ? t("upgrade1029NewComponents.agentObservabilitySettings.logs") : t("upgrade1029NewComponents.agentObservabilitySettings.traces")}: {receipt.signals[signal].message}</p>)}
      </div>}
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={reset}>{t("adminExtra.experimental.cancel")}</Button>
        <Button type="button" disabled={busy || !dirty || hasConflict} onClick={() => save()}>{saving ? t("agentManagement.actions.saving") : t("newUi.kdd0ae7a5cbcf")}</Button>
      </div>
      {dirty && settings && <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.saveBeforeTesting")}</p>}
      {settings && <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={busy || dirty || hasConflict} onClick={onTest}>{testing ? t("onboardingResidual.testing") : t("upgrade1029NewComponents.agentObservabilitySettings.testSaved")}</Button>
        {settings.enabled && <Button type="button" size="sm" variant="ghost" disabled={busy || dirty || hasConflict} onClick={() => save(false)}>{t("upgrade1029NewComponents.agentObservabilitySettings.disableExport")}</Button>}
        <Button type="button" size="sm" variant="ghost" disabled={busy || dirty || hasConflict} onClick={onRemove}>{removing ? t("adapterTools.adapterManager.removing") : t("upgrade1029NewComponents.agentObservabilitySettings.removeConfiguration")}</Button>
      </div>}
    </>}
  </section>;
}

export function AgentObservabilitySettingsSection({ companyId }: { companyId: string }) {
  return <AgentObservabilitySettingsContainer key={companyId} companyId={companyId} />;
}
function AgentObservabilitySettingsContainer({ companyId }: { companyId: string }) {
  const client = useQueryClient();
  const queryKey = ["agent-observability", companyId];
  const query = useQuery({ queryKey, queryFn: () => agentObservabilityApi.settings(companyId) });
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const accept = (data: AgentObservabilitySettingsResponse) => { client.setQueryData(queryKey, data); setError(null); setConflict(false); setResetKey(value => value + 1); };
  const reject = (cause: unknown) => {
    const stale = cause instanceof ApiError && cause.status === 409;
    setConflict(stale);
    setError(stale ? t("upgrade1029NewComponents.agentObservabilitySettings.conflict") : cause instanceof Error ? cause.message : t("upgrade1029NewComponents.agentObservabilitySettings.updateFailed"));
  };
  const save = useMutation({ gcTime: 0, mutationFn: (input: UpdateAgentObservabilityRequest) => agentObservabilityApi.update(companyId, input), onSuccess: accept, onError: reject, onSettled: () => queueMicrotask(() => save.reset()) });
  const remove = useMutation({ mutationFn: (revision: string) => agentObservabilityApi.remove(companyId, revision), onSuccess: accept, onError: reject });
  const test = useMutation({ mutationFn: (revision: string) => agentObservabilityApi.test(companyId, revision), onSuccess: receipt => {
    setError(null); client.setQueryData<AgentObservabilitySettingsResponse>(queryKey, current => current?.settings?.revision === receipt.revision
      ? { ...current, settings: { ...current.settings, lastTest: receipt } } : current);
  }, onError: reject });
  useEffect(() => { setError(null); setConflict(false); save.reset(); test.reset(); remove.reset(); }, [companyId]);
  if (query.isPending) return <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.agentObservabilitySettings.loading")}</p>;
  if (!query.data) return <div role="alert" className="space-y-2 text-sm"><p>{t("upgrade1029NewComponents.agentObservabilitySettings.loadFailed")}</p><Button variant="outline" size="sm" onClick={() => void query.refetch()}>{t("adapterImportVault.retry")}</Button></div>;
  return <AgentObservabilitySettingsView key={companyId} companyId={companyId} settings={query.data.settings} canManage={query.data.canManage}
    saving={save.isPending} removing={remove.isPending} testing={test.isPending} error={error ?? (query.isError ? t("upgrade1029NewComponents.agentObservabilitySettings.refreshFailed") : null)} conflict={conflict} resetKey={resetKey}
    onSave={input => save.mutate(input)} onTest={() => { if (query.data.settings) test.mutate(query.data.settings.revision); }}
    onRemove={() => { if (query.data.settings) remove.mutate(query.data.settings.revision); }}
    onReload={() => { setConflict(false); setError(null); void query.refetch(); }} />;
}
