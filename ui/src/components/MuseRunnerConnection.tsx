import { t } from "@/i18n";
import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { museDetectorCleanupAttestationSchema } from "@paperclipai/shared";
import type { MuseConnection, MusePairing, MuseAttestStopInput, MuseDetectorCleanupAttestationInput } from "@paperclipai/shared";
import { agentsApi } from "@/api/agents";
import { useMuseConnection, useMuseConnectionState } from "@/hooks/useMuseConnection";
import { queryKeys } from "@/lib/queryKeys";
import { formatDateTime } from "@/lib/utils";
import { AgentSetupPrompt } from "./AgentSetupPrompt";
import { MuseConnectionChecks } from "./new-agent/ExternalAgentInviteContent";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export interface MuseConnectionDetailsProps {
  connection: MuseConnection;
  pairing?: MusePairing | null;
  busy?: boolean;
  error?: string;
  offline?: boolean;
  onTest: () => void;
  onRepair: () => void;
  onPause: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onAttest: (input: MuseAttestStopInput) => void;
  onAttestDetectorCleanup?: (input: MuseDetectorCleanupAttestationInput) => void;
}

/** The settings view uses the same connection evidence as the invitation. */
export function MuseConnectionDetails({ connection, pairing, busy, error, offline = false, onTest, onRepair, onPause, onDisconnect, onRefresh, onAttest, onAttestDetectorCleanup }: MuseConnectionDetailsProps) {
  const b = connection.binding;
  const [attestation, setAttestation] = useState<MuseAttestStopInput | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [detectorSnapshot, setDetectorSnapshot] = useState<Omit<MuseDetectorCleanupAttestationInput, "observation" | "detectorRemoved"> | null>(null);
  const [detectorHookId, setDetectorHookId] = useState("");
  const [observationDigest, setObservationDigest] = useState("");
  const [detectorObservedAt, setDetectorObservedAt] = useState("");
  const detectorObservedAtValid = museDetectorCleanupAttestationSchema.shape.observation.shape.observedAt.safeParse(detectorObservedAt).success;
  const [detectorConfirmed, setDetectorConfirmed] = useState(false);
  const detectorIdentity = JSON.stringify([b?.id, b?.generation, b?.revision, b?.qualification?.id, b?.cleanup.hookScript, b?.cleanup.attestationEligible, offline]);
  useEffect(() => { setDetectorSnapshot(null); setObservationDigest(""); setDetectorObservedAt(""); setDetectorHookId(""); setDetectorConfirmed(false); }, [detectorIdentity]);
  const boundaryIdentity = JSON.stringify(b?.stop.boundary);
  const stopBindingRevision = b?.stop.bindingRevision;
  useEffect(() => { setAttestation(null); setConfirmed(false); }, [boundaryIdentity, stopBindingRevision]);
  const live = !!b && b.status !== "revoked";
  const state = useMuseConnectionState(connection, { offline });
  const testing = state.testing;
  const configure = !offline && connection.enabled && connection.canConfigureConnection && !!connection.publicOrigin;
  const timestamp = (value: string | null) => value ? formatDateTime(value, { includeSeconds: true }) : t("newUi.k1d3efcd60643");
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.intro")}</p>
    {!connection.enabled && <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.disabled")}</p>}
    {!connection.publicOrigin && <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.publicOriginRequired")}</p>}
    {b && <>
      <MuseConnectionChecks state={state} />
      <dl className="space-y-2 text-xs">
        {[
          [t("upgrade1029NewComponents.museRunnerConnection.lastReceiverContact"), timestamp(b.lastReceiverContactAt)],
          [t("upgrade1029NewComponents.museRunnerConnection.workerActivity"), timestamp(b.lastWorkerActivityAt)],
          [t("upgrade1029NewComponents.museRunnerConnection.lastVerifiedReply"), timestamp(b.lastVerifiedReplyAt)],
          [t("upgrade1029NewComponents.museRunnerConnection.credentialStatus"), b.credentialState],
          [t("upgrade1029NewComponents.museRunnerConnection.refreshExpires"), timestamp(b.refreshExpiresAt)],
          [t("upgrade1029NewComponents.museRunnerConnection.clientVersion"), b.clientVersion ?? t("upgrade2610Apps.usage.notReported")],
          [t("upgrade1029NewComponents.museRunnerConnection.liveAssignments"), String(b.liveAssignments)],
          [t("upgrade1029NewComponents.museRunnerConnection.uncertainOperations"), String(b.uncertainOperations)],
          [t("upgrade1029NewComponents.museRunnerConnection.pendingAnswers"), String(b.pendingInputs)],
          [t("upgrade1029NewComponents.museRunnerConnection.usageAndCost"), t("upgrade2610Apps.usage.unavailable")],
        ].map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono">{value}</dd></div>)}
      </dl>
      <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.contactLag", { seconds: Math.ceil(b.contactPersistenceLagMs / 1000) })}</p>
      {b.status === "revoked" && <p role="status" className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.disconnected")}</p>}
      {(b.cleanup.pending || b.status === "revoked") && <div className="space-y-2 text-sm text-muted-foreground">
        {"detectorRemovalRequested" in b.cleanup && b.cleanup.detectorRemovalRequested === true && !b.cleanup.detectorRemoved && <p>{t("upgrade1029NewComponents.museRunnerConnection.removalRequested")}</p>}
        <p>{t("upgrade1029NewComponents.museRunnerConnection.cleanupStatus", { detector: b.cleanup.detectorEvidence?.source === "operator_runtime_attestation" ? t("upgrade1029NewComponents.museRunnerConnection.operatorAttested") : b.cleanup.detectorRemoved ? t("upgrade1029NewComponents.museRunnerConnection.acknowledged") : t("upgrade1029NewComponents.museRunnerConnection.notConfirmed"), worker: b.cleanup.workerQuiescenceReported ? t("upgrade1029NewComponents.museRunnerConnection.reported") : t("upgrade1029NewComponents.museRunnerConnection.notConfirmed") })}</p>
        {b.cleanup.authenticatedAfterRevocation === false && <p>{t("upgrade1029NewComponents.museRunnerConnection.afterDisconnect")}</p>}
        {b.cleanup.expiresAt && <p className="text-xs">{t("upgrade1029NewComponents.museRunnerConnection.cleanupExpires", { time: formatDateTime(b.cleanup.expiresAt) })}</p>}
        {b.cleanup.detectorEvidence && <p>{t("upgrade1029NewComponents.museRunnerConnection.recordedEvidence", { time: timestamp(b.cleanup.detectorEvidence.recordedAt), source: b.cleanup.detectorEvidence.source === "operator_runtime_attestation" ? t("upgrade1029NewComponents.museRunnerConnection.operatorAttestationSource") : t("upgrade1029NewComponents.museRunnerConnection.workerReportSource") })}</p>}
        {b.cleanup.attestationEligible && onAttestDetectorCleanup && !detectorSnapshot && <Button type="button" variant="outline" disabled={busy || offline} onClick={() => {
          if (!b.cleanup.hookScript) return;
          setDetectorSnapshot({ bindingId: b.id, generation: b.generation, expectedRevision: b.revision, qualificationId: b.qualification?.id ?? null, hookScript: b.cleanup.hookScript });
        }}>{t("upgrade1029NewComponents.museRunnerConnection.recordDetectorObservation")}</Button>}
        <p>{t("upgrade1029NewComponents.museRunnerConnection.separateSteps")}</p>
      </div>}
      {b.stop.status !== "none" && <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{b.stop.status === "operator_attested" ? t("upgrade1029NewComponents.museRunnerConnection.stopOperatorAttested")
          : b.stop.status === "worker_reported" ? t("upgrade1029NewComponents.museRunnerConnection.stopWorkerReported")
          : t("upgrade1029NewComponents.museRunnerConnection.stopFenced")}</p>
        {b.stop.nativeEffectsUnknown && <p role="status" className="text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.nativeEffectsUnknown")}</p>}
        {b.stop.boundary && stopBindingRevision == null && b.stop.status !== "operator_attested" && <p role="status" className="text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.revisionUnavailable")}</p>}
        {b.stop.boundary && b.stop.status !== "operator_attested" && !attestation && <Button type="button" variant="outline" disabled={busy || stopBindingRevision == null} onClick={() => {
          if (!b.stop.boundary || stopBindingRevision == null) return;
          setAttestation({ boundary: { ...b.stop.boundary }, expectedRevision: stopBindingRevision, workerStopped: true }); setConfirmed(false);
        }}>{t("upgrade1029NewComponents.museRunnerConnection.attestWorkerStopped")}</Button>}
      </div>}
    </>}
    {detectorSnapshot && <section aria-label={t("upgrade1029NewComponents.museRunnerConnection.recordExactRemoval")} className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{t("upgrade1029NewComponents.museRunnerConnection.recordObservationTitle")}</p>
      <p className="break-all font-mono text-xs">{detectorSnapshot.hookScript}</p>
      <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.useSupportedBefore")}<code>{"hooks.list({ include_disabled: true })"}</code>{t("upgrade1029NewComponents.museRunnerConnection.useSupportedAfter")}</p>
      <label className="block space-y-2 text-sm">{t("upgrade1029NewComponents.museRunnerConnection.hookId")}<Input aria-label={t("upgrade1029NewComponents.museRunnerConnection.hookIdAria")} value={detectorHookId} onChange={event => { setDetectorHookId(event.target.value); setDetectorConfirmed(false); }} autoComplete="off" /></label>
      <label className="block space-y-2 text-sm">{t("upgrade1029NewComponents.museRunnerConnection.observationSha")}<Input aria-label={t("upgrade1029NewComponents.museRunnerConnection.observationShaAria")} value={observationDigest} onChange={event => { setObservationDigest(event.target.value); setDetectorConfirmed(false); }} autoComplete="off" /></label>
      <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.digestHelp")}</p>
      <label className="block space-y-2 text-sm">{t("upgrade1029NewComponents.museRunnerConnection.observedAt")}<Input aria-label={t("upgrade1029NewComponents.museRunnerConnection.observedAtAria")} value={detectorObservedAt} onChange={event => { setDetectorObservedAt(event.target.value); setDetectorConfirmed(false); }} placeholder="YYYY-MM-DDTHH:mm:ss.sssZ" autoComplete="off" /></label>
      <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.observedAtHelp")}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={detectorConfirmed} onChange={event => setDetectorConfirmed(event.target.checked)} className="mt-1 accent-primary" /><span>{t("upgrade1029NewComponents.museRunnerConnection.detectorConfirm")}</span></label>
      <div className="flex items-center justify-between gap-3"><Button type="button" variant="ghost" onClick={() => setDetectorSnapshot(null)}>{t("agentManagement.actions.cancel")}</Button><Button type="button" disabled={!detectorConfirmed || !detectorObservedAtValid || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(detectorHookId) || !/^[a-f0-9]{64}$/.test(observationDigest) || busy || offline} onClick={() => onAttestDetectorCleanup?.({ ...detectorSnapshot, detectorRemoved: true, observation: { method: "hooks.list", includeDisabled: true, hookId: detectorHookId, outcome: "exact_hook_absent", observedAt: detectorObservedAt, sha256: observationDigest } })}>{t("upgrade1029NewComponents.museRunnerConnection.confirmDetectorObservation")}</Button></div>
    </section>}
    {attestation && <section aria-label={t("upgrade1029NewComponents.museRunnerConnection.attestSectionAria")} className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">{t("upgrade1029NewComponents.museRunnerConnection.confirmWorkerTitle")}</p>
      <dl className="space-y-2 text-xs">
        {Object.entries(attestation.boundary).map(([key, value]) => <div key={key} className="flex flex-wrap items-baseline justify-between gap-2"><dt className="text-muted-foreground">{key}</dt><dd className="break-all font-mono">{value === null ? t("issueProperties.none") : String(value)}</dd></div>)}
      </dl>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 accent-primary" /><span>{t("upgrade1029NewComponents.museRunnerConnection.workerConfirm")}</span></label>
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={() => setAttestation(null)}>{t("agentManagement.actions.cancel")}</Button>
        <Button type="button" disabled={!confirmed || busy} onClick={() => onAttest(attestation)}>{t("upgrade1029NewComponents.museRunnerConnection.confirmWorkerStopped")}</Button>
      </div>
    </section>}
    {pairing && !b?.paired && <div className="space-y-2">
      <AgentSetupPrompt key={pairing.bindingId + pairing.revision} prompt={pairing.setupInstruction} label={t("newUi.k9a5d81ccb428")} title={t("upgrade1029NewComponents.museRunnerConnection.connectYourMuse")} agent={{ name: "Muse", icon: <Bot className="size-5" /> }} description={t("upgrade1029NewComponents.museRunnerConnection.setupDescription")} />
      <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.setupExpires", { time: formatDateTime(pairing.expiresAt) })}</p>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      {live && <Button type="button" variant="outline" disabled={!configure || b.credentialState !== "active" || !b.paired || busy || testing} onClick={onTest}>{testing ? t("upgrade1029NewComponents.museRunnerConnection.testingReply") : t("upgrade1029NewComponents.museRunnerConnection.testReply")}</Button>}
      <Button type="button" variant="outline" disabled={!configure || busy} onClick={onRepair}>{b?.credentialState === "expired" ? t("upgrade1029NewComponents.museRunnerConnection.reconnect") : live ? t("upgrade1029NewComponents.museRunnerConnection.repair") : t("upgrade1029NewComponents.museRunnerConnection.connect")}</Button>
      {connection.agentStatus !== "paused" && connection.agentStatus !== "terminated" && <Button type="button" variant="outline" disabled={busy} onClick={onPause}>{t("agents.pauseAgent")}</Button>}
      {live && <Button type="button" variant="outline" disabled={busy} onClick={onDisconnect}>{t("environmentsExtra.disconnect")}</Button>}
      <Button type="button" variant="ghost" disabled={busy} onClick={onRefresh}>{t("commonControls.refresh")}</Button>
      <Button type="button" asChild variant="ghost"><a href="https://muse.ai" target="_blank" rel="noopener noreferrer">{t("upgrade1029NewComponents.museRunnerConnection.openMuse")}</a></Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

export function MuseRunnerConnection({ companyId, agentId }: { companyId?: string; agentId?: string }) {
  const cache = useQueryClient();
  const muse = useMuseConnection(companyId, agentId);
  const pause = useMutation({ mutationFn: () => agentsApi.pause(agentId!, companyId), onSuccess: () => {
    void muse.refresh(); void cache.invalidateQueries({ queryKey: queryKeys.agents.detail(agentId!) });
    if (companyId) void cache.invalidateQueries({ queryKey: queryKeys.agents.list(companyId) });
  } });
  if (!agentId) return <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.museRunnerConnection.saveAgentFirst")}</p>;
  const error = muse.state.error ?? muse.pair.error ?? muse.verify.error ?? muse.revoke.error ?? muse.attest.error ?? muse.attestDetector.error ?? pause.error;
  if (muse.identity.failed) return <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{t("upgrade1029NewComponents.museRunnerConnection.identityFailed")}</p><Button type="button" variant="outline" onClick={() => { void cache.invalidateQueries({ queryKey: queryKeys.auth.session }); }}>{t("commonControls.refresh")}</Button></div>;
  if (!muse.state.data) return <div className="space-y-3"><p role="status" className="text-sm text-muted-foreground">{muse.state.error ? t("upgrade1029NewComponents.museRunnerConnection.loadFailed") : t("upgrade1029NewComponents.museRunnerConnection.loading")}</p>{error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}<Button type="button" variant="outline" onClick={() => { void muse.state.refetch(); }}>{t("commonControls.refresh")}</Button></div>;
  return <MuseConnectionDetails key={muse.identity.userId} connection={muse.state.data} pairing={muse.pairing} offline={muse.state.isError}
    busy={muse.pair.isPending || muse.verify.isPending || muse.revoke.isPending || muse.attest.isPending || muse.attestDetector.isPending || pause.isPending}
    error={error?.message} onTest={() => { if (muse.binding) muse.verify.mutate(muse.binding); }} onRepair={muse.repair}
    onPause={() => pause.mutate()} onDisconnect={() => { if (muse.binding) muse.revoke.mutate(muse.binding); }}
    onRefresh={() => { void muse.state.refetch(); }} onAttest={input => muse.attest.mutate(input)} onAttestDetectorCleanup={input => muse.attestDetector.mutate(input)} />;
}
