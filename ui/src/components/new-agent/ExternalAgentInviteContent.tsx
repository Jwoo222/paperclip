import { useId } from "react";
import { AGENT_ROLES, AGENT_ROLE_LABELS } from "@paperclipai/shared";
import type { MuseInvitationDraft } from "@/lib/muse-invitation-draft";
import { Input } from "../ui/input";
import { Link } from "@/lib/router";
import { ArrowLeft, Bot, Check, Circle, CircleAlert, Loader2 } from "lucide-react";
import { AdapterMark } from "../AdapterMark";
import { AgentSetupPrompt } from "../AgentSetupPrompt";
import { Button } from "../ui/button";
import { DialogDescription, DialogTitle } from "../ui/dialog";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type ExternalAgentPreset = "dot" | "grok_bot" | "muse" | "hermes" | "other";
export type DotConnectionState = {
  phase: "waiting" | "connected" | "subscribed" | "testing" | "finishing" | "ready";
  problem?: "event_timeout" | "prompt_unavailable" | "offline" | "agent_unavailable";
};

const presets = [
  { id: "dot", name: "Dot", adapter: "openai_dot", descriptionKey: "dot" },
  { id: "grok_bot", name: "Grok Bot", adapter: "grok_bot", descriptionKey: "grokBot" },
  { id: "muse", name: null, adapter: "muse", descriptionKey: "muse" },
  { id: "hermes", name: "Hermes", adapter: "hermes_gateway", descriptionKey: "hermes" },
  { id: "other", name: null, adapter: "http", descriptionKey: "other" },
] as const;

function presetName(preset: (typeof presets)[number]) {
  return preset.name ?? t(`upgrade1029NewComponents.externalAgentInviteContent.presetNames.${preset.descriptionKey}`);
}

export function ExternalAgentPresetPicker({ onSelect, dotDisabledReason, grokDisabledReason, museEnabled = false }: { onSelect: (preset: ExternalAgentPreset) => void; dotDisabledReason?: string; grokDisabledReason?: string; museEnabled?: boolean }) {
  return <div className={cn("grid grid-cols-2 gap-3", !museEnabled && "sm:grid-cols-4")}>
    {presets.filter(preset => preset.id !== "muse" || museEnabled).map(preset => <button
      key={preset.id}
      type="button"
      onClick={() => onSelect(preset.id)}
      disabled={preset.id === "dot" && !!dotDisabledReason || preset.id === "grok_bot" && !!grokDisabledReason}
      title={preset.id === "dot" ? dotDisabledReason : preset.id === "grok_bot" ? grokDisabledReason : undefined}
      className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-3 py-4 text-center transition-colors disabled:opacity-50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <AdapterMark type={preset.adapter} className="size-8" />
      <span className="text-sm font-medium">{presetName(preset)}</span>
      <span className="sr-only">{t(`upgrade1029NewComponents.externalAgentInviteContent.presetDescriptions.${preset.descriptionKey}`)}</span>
    </button>)}
  </div>;
}

const checkKeys = ["connected", "taskUpdates", "testEvent"] as const;

/** Controlled by server evidence in the invite controller, never by copying a prompt. */
export function DotConnectionChecks({ state }: { state: DotConnectionState }) {
  const completed = { waiting: 0, connected: 1, subscribed: 2, testing: 2, finishing: 3, ready: 3 }[state.phase];
  const messageKey = state.problem === "agent_unavailable" ? "agentUnavailable"
    : state.problem === "offline" ? "offline"
    : state.problem === "prompt_unavailable" ? "promptUnavailable"
    : state.problem === "event_timeout" ? "eventTimeout"
    : state.phase === "finishing" ? "finishing"
    : state.phase === "ready" ? "ready"
    : state.phase === "waiting" ? "waiting"
    : state.phase === "connected" ? "connected"
    : "testing";
  const message = t(`upgrade1029NewComponents.externalAgentInviteContent.dotMessages.${messageKey}`);
  return <section aria-label={t("upgrade1029NewComponents.externalAgentInviteContent.dotChecksAria")} className="space-y-4">
    <ol className="space-y-4">
      {checkKeys.map((checkKey, index) => {
        const done = index < completed;
        const failed = index === completed && state.problem === "event_timeout";
        const active = index === completed && !state.problem;
        const Icon = done ? Check : failed ? CircleAlert : active ? Loader2 : Circle;
        return <li key={checkKey} className="flex items-start gap-3" aria-current={active ? "step" : undefined}>
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", done ? "bg-accent text-foreground" : failed ? "text-destructive" : "text-muted-foreground")}>
            <Icon className={cn("size-4", active && "animate-spin motion-reduce:animate-none")} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={cn("text-sm", done || active || failed ? "font-medium" : "text-muted-foreground")}>
              {t(`upgrade1029NewComponents.externalAgentInviteContent.dotChecks.${checkKey}.title`)}<span className="sr-only">{done ? t("upgrade1029NewComponents.externalAgentInviteContent.srComplete") : failed ? t("upgrade1029NewComponents.externalAgentInviteContent.srNeedsAttention") : active ? t("upgrade1029NewComponents.externalAgentInviteContent.srInProgress") : t("upgrade1029NewComponents.externalAgentInviteContent.srWaiting")}</span>
            </p>
            {done && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(`upgrade1029NewComponents.externalAgentInviteContent.dotChecks.${checkKey}.description`)}</p>}
          </div>
        </li>;
      })}
    </ol>
    <p role={state.problem && state.problem !== "prompt_unavailable" ? "alert" : "status"} aria-live="polite" className={cn("text-sm leading-relaxed", state.problem && state.problem !== "prompt_unavailable" ? "text-destructive" : "text-muted-foreground")}>{message}</p>
  </section>;
}

export type MuseConnectionState = {
  paired: boolean;
  receiverDetected: boolean;
  backgroundReplyVerified: boolean;
  ready: boolean;
  finishing?: boolean;
  testing?: boolean;
  problem?: "no_recent_response" | "prompt_unavailable" | "offline" | "agent_unavailable" | "disconnected" | "disabled" | "connection_expired";
};

/** Receiver contact is separate from an authenticated, independent worker reply. */
export function MuseConnectionChecks({ state }: { state: MuseConnectionState }) {
  const milestones = [
    { id: "paired", title: t("upgrade1029NewComponents.externalAgentInviteContent.museChecks.paired.title"), done: state.paired, description: t("upgrade1029NewComponents.externalAgentInviteContent.museChecks.paired.description") },
    { id: "receiver", title: t("upgrade1029NewComponents.externalAgentInviteContent.museChecks.receiver.title"), done: state.receiverDetected, description: t("upgrade1029NewComponents.externalAgentInviteContent.museChecks.receiver.description") },
    { id: "background", title: t("upgrade1029NewComponents.externalAgentInviteContent.museChecks.background.title"), done: state.backgroundReplyVerified, description: t("upgrade1029NewComponents.externalAgentInviteContent.museChecks.background.description") },
  ];
  const checksPassed = milestones.every(item => item.done);
  const messageKey = state.problem === "offline" ? "offline"
    : state.problem === "disconnected" ? "disconnected"
    : state.problem === "connection_expired" ? "connectionExpired"
    : state.problem === "disabled" ? "disabled"
    : state.problem === "prompt_unavailable" ? "promptUnavailable"
    : state.problem === "agent_unavailable" ? "agentUnavailable"
    : state.problem === "no_recent_response" ? "noRecentResponse"
    : state.testing ? "testing"
    : checksPassed && state.ready ? "ready"
    : checksPassed ? "finishing"
    : !state.paired ? "waitingPair"
    : !state.receiverDetected ? "paired"
    : "receiverDetected";
  const message = t(`upgrade1029NewComponents.externalAgentInviteContent.museMessages.${messageKey}`);
  return <section aria-label={t("upgrade1029NewComponents.externalAgentInviteContent.museChecksAria")} className="space-y-4">
    <ol className="space-y-4">
      {milestones.map(item => <li key={item.id} className="flex items-start gap-3">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full", item.done ? "bg-accent text-foreground" : "text-muted-foreground")}>
          {item.done ? <Check className="size-4" /> : <Circle className="size-4" />}
        </span>
        <div className="min-w-0 pt-0.5">
          <p className={cn("text-sm", item.done ? "font-medium" : "text-muted-foreground")}>
            {item.title}<span className="sr-only">{item.done ? t("upgrade1029NewComponents.externalAgentInviteContent.srComplete") : t("upgrade1029NewComponents.externalAgentInviteContent.srWaiting")}</span>
          </p>
          {item.done && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>}
        </div>
      </li>)}
    </ol>
    <p role="status" aria-live="polite" className="text-sm leading-relaxed text-muted-foreground">{message}</p>
  </section>;
}

/** Shared presentation for the invitation flow. The caller owns invitations and watching. */
export function ExternalAgentInviteContent({
  preset, prompt, companyName, connection, onSelect, onBack, onClose, onCopied, onRetry, onNewPrompt,
  dotDisabledReason, grokDisabledReason, busy = false, error, approvalHref, museEnabled = false, museConnection, museDraft, onMuseDraftChange, onMuseContinue,
}: {
  museEnabled?: boolean;
  museConnection?: MuseConnectionState;
  museDraft?: MuseInvitationDraft;
  onMuseDraftChange?: (draft: MuseInvitationDraft) => void;
  onMuseContinue?: () => void;
  dotDisabledReason?: string;
  grokDisabledReason?: string;
  busy?: boolean;
  error?: string;
  approvalHref?: string;
  preset: ExternalAgentPreset | null;
  prompt: string;
  companyName: string;
  connection: DotConnectionState;
  onSelect: (preset: ExternalAgentPreset) => void;
  onBack: () => void;
  onClose: () => void;
  onCopied: () => void;
  onRetry: () => void;
  onNewPrompt: () => void;
}) {
  const detailsId = useId();
  const muse = preset === "muse";
  const museDetails = muse && !!museDraft;
  const museAwaitingInvitation = muse && !museDetails && !museConnection && !approvalHref;
  const museReady = muse && !!museConnection?.ready && museConnection.paired && museConnection.receiverDetected && museConnection.backgroundReplyVerified && !museConnection.problem && !museConnection.testing;
  const provider = presets.find(item => item.id === preset);
  const dot = preset === "dot";
  const ready = museReady || (dot && connection.phase === "ready" && !connection.problem);
  const connecting = dot && connection.phase !== "waiting";
  const progressLabel = connection.problem === "agent_unavailable" ? t("upgrade1029NewComponents.externalAgentInviteContent.agentUnavailable")
    : connection.problem === "offline" ? t("upgrade1029NewComponents.externalAgentInviteContent.updatesPaused")
    : connection.problem === "event_timeout" ? t("appDetail.status.needsAttention")
    : connection.phase === "finishing" ? t("upgrade1029NewComponents.grokBotSetupContent.finishingSetup")
    : connection.phase === "connected" ? t("upgrade2610Apps.credentialStep.connecting") : t("upgrade1029NewComponents.externalAgentInviteContent.confirmingConnection");
  return <>
    <div className="min-h-0 space-y-6 overflow-y-auto px-6 pb-6 pt-8 sm:px-8">
      <div className="space-y-3 pr-5">
        {muse && <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4" />{t("agentManagement.actions.back")}</Button>}
        {provider && <AdapterMark type={provider.adapter} className="size-10" />}
        <div className="space-y-2">
          <DialogTitle className="text-xl font-semibold tracking-tight">
            {!provider ? t("agentManagement.dialog.inviteExternal") : muse ? ready ? t("upgrade1029NewComponents.externalAgentInviteContent.titles.museConnected") : museDetails || museAwaitingInvitation ? t("upgrade1029NewComponents.externalAgentInviteContent.titles.inviteMuse") : t("upgrade1029NewComponents.externalAgentInviteContent.titles.connectMuse") : dot ? ready ? t("upgrade1029NewComponents.externalAgentInviteContent.titles.dotConnected") : t("upgrade1029NewComponents.externalAgentInviteContent.titles.connectDot") : preset === "hermes" ? t("upgrade1029NewComponents.externalAgentInviteContent.titles.inviteHermes") : t("upgrade2610Agents.inviteTitle")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {!provider ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.picker", { companyName })
              : muse ? museDetails ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.museDetails", { companyName })
              : museAwaitingInvitation ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.museRequirements")
              : ready ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.museReady", { companyName })
              : !prompt && !museConnection?.paired ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.museChecking")
              : t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.musePaste")
              : ready ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.dotReady", { companyName })
              : connection.problem === "agent_unavailable" ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.dotAgentUnavailable")
              : connection.phase === "finishing" ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.dotFinishing")
              : connecting ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.dotConnecting")
              : dot ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.dotCopy")
              : preset === "hermes" ? t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.hermesCopy") : t("upgrade1029NewComponents.externalAgentInviteContent.descriptions.otherCopy")}
          </DialogDescription>
        </div>
      </div>
      {error && <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p>{!museAwaitingInvitation && <Button variant="outline" disabled={busy} onClick={onRetry}>{t("taskDetail.tryAgain")}</Button>}</div>}
      {!provider ? <><ExternalAgentPresetPicker onSelect={onSelect} dotDisabledReason={dotDisabledReason} grokDisabledReason={grokDisabledReason} museEnabled={museEnabled} />
        {dotDisabledReason && <p className="text-sm text-muted-foreground">{dotDisabledReason}</p>}{grokDisabledReason && grokDisabledReason !== dotDisabledReason && <p className="text-sm text-muted-foreground">{grokDisabledReason}</p>}</>
        : approvalHref ? <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.needsApproval", { agent: muse ? "Muse" : "Dot" })}</p>
        : museAwaitingInvitation ? busy ? <p role="status" className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.loadingMuseInvitation")}</p> : null
        : muse && busy && !museDetails && !prompt && !museConnection?.paired ? <p role="status" className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.loadingMuseSetup")}</p>
        : museDetails ? <form id={detailsId} className="space-y-4" onSubmit={event => { event.preventDefault(); if (museDraft.name.trim() && !busy) onMuseContinue?.(); }}>
          <div className="space-y-2">
            <label htmlFor={`${detailsId}-name`} className="text-sm font-medium">{t("agentManagement.form.agentName")}</label>
            <Input id={`${detailsId}-name`} disabled={busy} autoFocus maxLength={100} value={museDraft.name} placeholder="Muse" onChange={event => onMuseDraftChange?.({ ...museDraft, name: event.target.value })} />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${detailsId}-role`} className="text-sm font-medium">{t("agentManagement.properties.role")}</label>
            <select id={`${detailsId}-role`} disabled={busy} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={museDraft.role} onChange={event => {
              const role = AGENT_ROLES.find(value => value === event.target.value);
              if (role) onMuseDraftChange?.({ ...museDraft, role });
            }}>{AGENT_ROLES.map(role => <option key={role} value={role}>{AGENT_ROLE_LABELS[role]}</option>)}</select>
          </div>
          <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.museToolsHint")}</p>
        </form>
        : muse && museConnection ? <>
          <MuseConnectionChecks state={museConnection} />
          {museConnection.problem === "no_recent_response" && <Button variant="outline" disabled={busy} onClick={onRetry}>{t("upgrade1029NewComponents.externalAgentInviteContent.testBackgroundReply")}</Button>}
          {museConnection.problem === "offline" && <Button variant="outline" disabled={busy} onClick={onRetry}>{t("upgrade1029NewComponents.externalAgentInviteContent.refreshConnection")}</Button>}
          {!museConnection.paired && <a href="https://muse.ai" target="_blank" rel="noopener noreferrer" className="inline-flex text-sm text-foreground underline underline-offset-4">{t("upgrade1029NewComponents.externalAgentInviteContent.openMuse")}</a>}
          <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.receiverHint")}</p>
        </>
        : busy && !prompt && connection.phase === "waiting" ? <p role="status" className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.preparingInvitation")}</p> : dot ? <>
        <div className="border-t pt-6"><DotConnectionChecks state={connection} />
          {connection.phase === "waiting" && <p className="mt-4 text-xs text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.dotAccountHint")}</p>}</div>
        {connection.problem === "event_timeout" && <Button variant="outline" disabled={busy} onClick={onRetry}>{t("upgrade1029NewComponents.externalAgentInviteContent.retryTestEvent")}</Button>}
        {connection.problem === "offline" && <Button variant="outline" disabled={busy} onClick={onRetry}>{t("upgrade1029NewComponents.externalAgentInviteContent.reconnectUpdates")}</Button>}
      </> : <p className="text-sm leading-relaxed text-muted-foreground">{t("upgrade1029NewComponents.externalAgentInviteContent.invitationIncludes", { companyName })}</p>}
    </div>
    <div className="flex items-center justify-between gap-3 border-t px-6 py-4 sm:px-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={muse ? onClose : provider ? onBack : onClose}>
          {provider && !muse && <ArrowLeft className="size-4" />}{muse ? ready ? t("shell.close") : t("newUi.k0bd63bf3d32e") : provider ? t("agentManagement.actions.back") : t("agentManagement.actions.cancel")}
        </Button>
      </div>
      {provider && (approvalHref ? <Button asChild><Link to={approvalHref} onClick={onClose}>{t("upgrade1029NewComponents.grokBotSetupContent.reviewApproval")}</Link></Button>
        : museDetails ? <Button type="submit" form={detailsId} disabled={busy || !museDraft.name.trim()}>{busy ? t("appsConnect.oauth.preparingProgress") : t("newUi.k31fbef162594")}</Button>
        : ready ? <Button onClick={onClose}>{t("agentManagement.actions.done")}</Button>
        : museAwaitingInvitation ? <Button disabled={busy} onClick={onRetry}>{busy ? t("upgrade1029NewComponents.externalAgentInviteContent.loadingSetup") : t("upgrade1029NewComponents.externalAgentInviteContent.refreshSetup")}</Button>
        : muse ? museConnection?.problem === "disconnected" || museConnection?.problem === "connection_expired" ? <Button disabled={busy} onClick={onNewPrompt}>{t("upgrade1029NewComponents.externalAgentInviteContent.reconnectMuse")}</Button>
          : museConnection?.problem === "prompt_unavailable" ? <Button disabled={busy} onClick={onNewPrompt}>{t("upgrade1029NewComponents.externalAgentInviteContent.createNewPrompt")}</Button>
          : !museConnection?.paired && prompt ? <AgentSetupPrompt key={prompt} prompt={prompt} label={t("newUi.k9a5d81ccb428")} title={t("upgrade1029NewComponents.externalAgentInviteContent.titles.connectMuse")} agent={{ name: "Muse", icon: <Bot className="size-5" /> }} description={t("upgrade1029NewComponents.externalAgentInviteContent.sendToMuse")} align="end" className="min-w-0 shrink" onCopied={onCopied} />
          : busy ? <Button disabled>{t("appsConnect.oauth.preparingProgress")}</Button>
          : <Button asChild><a href="https://muse.ai" target="_blank" rel="noopener noreferrer">{t("upgrade1029NewComponents.externalAgentInviteContent.openMuse")}</a></Button>
        : connecting ? <Button disabled aria-live="polite">
          {!connection.problem && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {progressLabel}
        </Button>
        : dot && connection.problem === "prompt_unavailable" ? <Button disabled={busy} onClick={onNewPrompt}>{t("upgrade1029NewComponents.externalAgentInviteContent.createNewPrompt")}</Button>
        : !prompt || busy ? <Button disabled>{busy ? t("appsConnect.oauth.preparingProgress") : t("upgrade1029NewComponents.externalAgentInviteContent.waitingForDot")}</Button>
        : <AgentSetupPrompt
          key={preset}
          prompt={prompt}
          label={dot ? t("newUi.k9a5d81ccb428") : t("upgrade1029NewComponents.externalAgentInviteContent.copyInvitationPrompt")}
          title={dot ? t("upgrade1029NewComponents.externalAgentInviteContent.titles.connectDot") : t("upgrade2610Agents.inviteTitle")}
          description={dot ? t("upgrade1029NewComponents.externalAgentInviteContent.sendToDot") : t("upgrade1029NewComponents.externalAgentInviteContent.sendToAgent")}
          agent={dot ? { name: "Dot", src: "/brands/adapters/openai-dot.svg" } : undefined}
          align="end"
          className="min-w-0 shrink"
          onCopied={onCopied}
        />)}
    </div>
  </>;
}
