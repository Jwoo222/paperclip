import { useId } from "react";
import { Check, Circle, Loader2 } from "lucide-react";
import { AGENT_ROLES, type CreateGrokInvitation, type DotPairing, type GrokConnection } from "@paperclipai/shared";
import { AdapterMark } from "../AdapterMark";
import { AgentSetupPrompt } from "../AgentSetupPrompt";
import { Button, buttonVariants } from "../ui/button";
import { CopyText } from "../CopyText";
import { Input } from "../ui/input";
import { NativeSelect } from "../ui/select";
import { DialogDescription, DialogTitle } from "../ui/dialog";
import { buildGrokAccessPrompt, buildGrokRoutinePrompt } from "@/lib/grok-bot-setup-prompt";
import { Link } from "@/lib/router";
import { t } from "@/i18n";

export type GrokSetupStep = 0 | 1 | 2 | 3;
export interface GrokBotSetupContentProps {
  step: GrokSetupStep; companyName: string; details: CreateGrokInvitation;
  created: boolean; loading?: boolean; busy?: boolean; error?: string;
  managers: Array<{ id: string; name: string }>;
  connection?: GrokConnection; pairing: DotPairing | null; approvalHref?: string;
  webhookUrl: string; webhookKey: string; editingCredentials?: boolean;
  onEditCredentials?: () => void;
  onDetails: (details: CreateGrokInvitation) => void;
  onCredentials: (url: string, key: string) => void;
  onBack: () => void; onExit: () => void; onNext: () => void; onRetry: () => void;
}
const stepKeys = ["identifyBot", "connectAccess", "enableAssignments", "verify"] as const;
export function GrokBotSetupContent(p: GrokBotSetupContentProps) {
  const pairingCodeId = useId();
  const binding = p.connection?.binding;
  const routine = binding?.routine;
  const exchange = routine?.lastExchange;
  const delivered = exchange?.status === "accepted" || exchange?.status === "acknowledged";
  const replied = !!routine?.verified && exchange?.status === "acknowledged";
  const ready = replied && p.connection?.agentLifecycleState === "ready" && !!p.connection.canConfigureConnection && !routine?.recoveryNeeded;
  const pending = exchange && ["prepared", "sending", "accepted"].includes(exchange.status) && Date.parse(exchange.expiresAt) > Date.now();
  const nextDisabled = p.busy || p.loading || !!p.approvalHref
    || p.step === 0 && (!p.details.name.trim() || !p.details.botName.trim())
    || p.step === 1 && !binding?.connected
    || p.step === 2 && ((!routine?.configured || p.editingCredentials) && (!p.webhookUrl || !p.webhookKey))
    || p.step === 3 && !ready && (!!pending || !!routine?.recoveryNeeded || !!replied);
  return <>
    <div className="min-h-0 space-y-6 overflow-y-auto px-6 pb-6 pt-8 sm:px-8">
      <div className="space-y-3 pr-5">
        <AdapterMark type="grok_bot" className="size-10" />
        <DialogTitle className="text-xl font-semibold tracking-tight">{ready ? t("upgrade1029NewComponents.grokBotSetupContent.titleReady") : t("upgrade1029NewComponents.grokBotSetupContent.title")}</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed">{ready ? t("upgrade1029NewComponents.grokBotSetupContent.descriptionReady", { botName: p.details.botName, companyName: p.companyName }) : t("upgrade1029NewComponents.grokBotSetupContent.description", { companyName: p.companyName })}</DialogDescription>
      </div>
      <ol aria-label={t("upgrade1029NewComponents.grokBotSetupContent.setupAria")} className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
        {stepKeys.map((stepKey, index) => <li key={stepKey} aria-current={p.step === index ? "step" : undefined} className={p.step === index ? "font-medium text-foreground" : ""}>{index + 1}. {t(`upgrade1029NewComponents.grokBotSetupContent.steps.${stepKey}`)}</li>)}
      </ol>
      {p.error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{p.error}</p><Button variant="outline" disabled={p.busy} onClick={p.onRetry}>{t("taskDetail.tryAgain")}</Button></div>}
      {p.loading ? <p role="status" className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.restoring")}</p> : p.approvalHref ? <p className="text-sm text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.needsApproval")}</p> : <>
        {p.step === 0 && <div className="space-y-4">
          <label className="block space-y-2 text-sm"><span>{t("secretsSupport.paperclipName")}</span><Input value={p.details.name} disabled={p.created} onChange={e => p.onDetails({ ...p.details, name: e.target.value })} autoComplete="off" maxLength={100} /></label>
          <label className="block space-y-2 text-sm"><span>{t("upgrade1029NewComponents.grokBotSetupContent.botNameInGrok")}</span><Input value={p.details.botName} disabled={p.created} onChange={e => p.onDetails({ ...p.details, botName: e.target.value })} autoComplete="off" maxLength={100} /></label>
          <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.botNameHint")}</p>
          <label className="block space-y-2 text-sm"><span>{t("agentManagement.properties.role")}</span><NativeSelect disabled={p.created} value={p.details.role ?? "general"} onChange={e => p.onDetails({ ...p.details, role: e.target.value as CreateGrokInvitation["role"] })}>{AGENT_ROLES.map(role => <option key={role} value={role}>{role.replaceAll("_", " ")}</option>)}</NativeSelect></label>
          <label className="block space-y-2 text-sm"><span>{t("upgrade1029NewComponents.grokBotSetupContent.manager")}</span><NativeSelect disabled={p.created} value={p.details.reportsTo ?? ""} onChange={e => p.onDetails({ ...p.details, reportsTo: e.target.value || null })}><option value="">{t("commonControls.noManager")}</option>{p.managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</NativeSelect></label>
        </div>}
        {p.step === 1 && <div className="space-y-4 text-sm">
          <p>{t("upgrade1029NewComponents.grokBotSetupContent.copyConnectionInstructions")}</p>
          {p.connection?.resourceUrl && <AgentSetupPrompt prompt={buildGrokAccessPrompt(p.connection.resourceUrl, p.details.botName)} label={t("upgrade1029NewComponents.grokBotSetupContent.copyConnectionInstructionsLabel")} title={t("upgrade1029NewComponents.grokBotSetupContent.connectPaperclipAccess")} description={t("upgrade1029NewComponents.grokBotSetupContent.connectAccessDescription")} />}
          {!binding?.connected && p.pairing && <div className="space-y-2">
            <label htmlFor={pairingCodeId}>{t("upgrade1029NewComponents.grokBotSetupContent.pairingCode")}</label>
            <div className="flex items-center gap-2">
              <Input id={pairingCodeId} value={p.pairing.pairingCode} readOnly type="password" autoComplete="off" />
              <CopyText text={p.pairing.pairingCode} ariaLabel={t("upgrade1029NewComponents.grokBotSetupContent.copyPairingCode")} className={buttonVariants({ variant: "outline", size: "sm" })}>{t("commonControls.copyCode")}</CopyText>
            </div>
            <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.pairingCodeHint", { time: new Date(p.pairing.expiresAt).toLocaleTimeString() })}</p>
          </div>}
          <p role="status" aria-live="polite" className="text-muted-foreground">{binding?.connected ? t("upgrade1029NewComponents.grokBotSetupContent.accessConnected") : t("upgrade1029NewComponents.grokBotSetupContent.watchingAuthorization")}</p>
          <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.pluginsAccountWide")}</p>
        </div>}
        {p.step === 2 && <div className="space-y-4 text-sm">
          <p>{t("upgrade1029NewComponents.grokBotSetupContent.askRoutine")}</p>
          {binding && <AgentSetupPrompt prompt={buildGrokRoutinePrompt(binding.id, p.details.botName)} label={t("upgrade1029NewComponents.grokBotSetupContent.copyRoutineInstructions")} title={t("upgrade1029NewComponents.grokBotSetupContent.steps.enableAssignments")} description={t("upgrade1029NewComponents.grokBotSetupContent.routineDescription")} />}
          <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.routineClickHint")}</p>
          {routine?.configured && !p.editingCredentials && !p.webhookUrl && !p.webhookKey ? <div className="space-y-2"><p role="status" className="text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.credentialsStored")}</p>{p.onEditCredentials && <Button variant="outline" onClick={p.onEditCredentials} disabled={p.busy}>{t("upgrade1029NewComponents.grokBotSetupContent.replaceCredentials")}</Button>}</div> : <>
            <label className="block space-y-2"><span>{t("onboardingResidual.webhookUrl")}</span><Input value={p.webhookUrl} onChange={e => p.onCredentials(e.target.value, p.webhookKey)} type="password" autoComplete="off" spellCheck={false} /></label>
            <label className="block space-y-2"><span>{t("upgrade1029NewComponents.grokBotSetupContent.webhookKey")}</span><Input value={p.webhookKey} onChange={e => p.onCredentials(p.webhookUrl, e.target.value)} type="password" autoComplete="off" spellCheck={false} /></label>
          </>}
          <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.credentialsHint")}</p>
        </div>}
        {p.step === 3 && <section aria-label={t("upgrade1029NewComponents.grokBotSetupContent.checksAria")} className="space-y-4 text-sm">
          {[{ id: "delivered", label: t("upgrade1029NewComponents.grokBotSetupContent.assignmentDelivered"), done: delivered }, { id: "replied", label: t("upgrade1029NewComponents.grokBotSetupContent.replyReceived"), done: replied }].map(check => <p key={check.id} className="flex items-center gap-3">{check.done ? <Check className="size-4" /> : pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Circle className="size-4 text-muted-foreground" />}{check.label}<span className="text-muted-foreground">{check.done ? t("taskDetail.complete") : t("newUi.k6e293a8c009e")}</span></p>)}
          <p role="status" aria-live="polite" className="text-muted-foreground">{routine?.recoveryNeeded ? t("upgrade1029NewComponents.grokBotSetupContent.status.recoveryNeeded") : ready ? t("upgrade1029NewComponents.grokBotSetupContent.status.ready") : replied ? t("upgrade1029NewComponents.grokBotSetupContent.status.finishing") : exchange?.status === "rejected" ? t("upgrade1029NewComponents.grokBotSetupContent.status.rejected") : delivered ? t("upgrade1029NewComponents.grokBotSetupContent.status.accepted") : t("upgrade1029NewComponents.grokBotSetupContent.status.idle")}</p>
          <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.grokBotSetupContent.runsExternally")}</p>
        </section>}
      </>}
    </div>
    <div className="flex items-center justify-between gap-3 border-t px-6 py-4 sm:px-8">
      <div className="flex items-center gap-2"><Button variant="ghost" onClick={p.onBack} disabled={p.busy}>{t("agentManagement.actions.back")}</Button><Button variant="ghost" onClick={p.onExit} disabled={p.busy}>{t("newUi.k0bd63bf3d32e")}</Button></div>
      {p.approvalHref ? <Button asChild><Link to={p.approvalHref} onClick={p.onExit}>{t("upgrade1029NewComponents.grokBotSetupContent.reviewApproval")}</Link></Button> : <Button onClick={p.onNext} disabled={nextDisabled}>{p.busy ? t("agentManagement.actions.saving") : ready ? t("agentManagement.actions.done") : p.step === 3 ? pending ? t("upgrade1029NewComponents.grokBotSetupContent.waitingForReply") : replied ? t("upgrade1029NewComponents.grokBotSetupContent.finishingSetup") : t("newUi.k7b840072a1e4") : t("newUi.k31fbef162594")}</Button>}
    </div>
  </>;
}
