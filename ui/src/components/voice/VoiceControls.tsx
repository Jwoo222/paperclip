import { Mic, MicOff, Phone, PhoneOff, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export const VOICE_CONTROL_STATES = ["idle", "connecting", "listening", "speaking", "working", "interrupted", "reconnecting", "ending", "ended", "failed", "cleanup_failed"] as const;
export type VoiceControlState = typeof VOICE_CONTROL_STATES[number];
/** Locale keys; resolved with t() at render time. */
const labels: Record<VoiceControlState, string> = {
  idle: "upgrade1029NewComponents.voiceControls.stateIdle", connecting: "upgrade2610Apps.credentialStep.connecting", listening: "upgrade1029NewComponents.voiceControls.stateListening", speaking: "upgrade1029NewComponents.voiceTranscript.speaking",
  working: "upgrade1029NewComponents.voiceControls.stateWorking", interrupted: "upgrade1029NewComponents.voiceControls.stateInterrupted", reconnecting: "upgrade1029NewComponents.voiceControls.stateReconnecting",
  ending: "upgrade1029NewComponents.voiceControls.stateEnding", ended: "upgrade1029NewComponents.voiceControls.stateEnded", failed: "upgrade1029NewComponents.voiceControls.stateFailed", cleanup_failed: "upgrade1029NewComponents.voiceControls.stateCleanupFailed",
};
export interface VoiceControlsProps {
  state: VoiceControlState;
  agentName: string;
  muted?: boolean;
  busy?: boolean;
  playbackBlocked?: boolean;
  canRepeat?: boolean;
  onRepeat?: () => void;
  error?: string;
  announcement?: string;
  onStart: () => void;
  onMute: () => void;
  onEnd: () => void;
  onResumeAudio: () => void;
  className?: string;
}
export function VoiceControls({ state, agentName, muted = false, busy = false, playbackBlocked = false, canRepeat = false, onRepeat, error, announcement, onStart, onMute, onEnd, onResumeAudio, className }: VoiceControlsProps) {
  const inactive = state === "idle" || state === "ended" || state === "failed";
  const connecting = state === "connecting" || state === "reconnecting";
  const startButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!inactive || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (document.activeElement === document.body) startButton.current?.focus();
  }, [inactive]);
  return (
    <section aria-label={t("upgrade1029NewComponents.voiceControls.sectionLabel", { name: agentName })} className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="break-words text-sm font-medium">{t("upgrade1029NewComponents.voiceControls.talkTo", { name: agentName })}</h3>
        <p role="status" className="text-sm text-muted-foreground">{t(labels[state])}{muted && !inactive ? ` · ${t("upgrade1029NewComponents.voiceControls.muted")}` : ""}</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {inactive ? (
          <Button ref={startButton} size="sm" disabled={busy} onClick={onStart}><Phone aria-hidden="true" />{state === "failed" ? t("appsConnect.common.tryAgain") : t("upgrade1029NewComponents.nativeVoiceConversation.startVoice")}</Button>
        ) : (
          <>
            <Button size="sm" variant="outline" aria-pressed={muted} disabled={busy || connecting || state === "ending" || state === "cleanup_failed"} onClick={onMute}>
              {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}{muted ? t("upgrade1029NewComponents.voiceControls.unmute") : t("upgrade1029NewComponents.voiceControls.mute")}
            </Button>
            <Button size="sm" variant="outline" disabled={state === "ending"} onClick={() => { restoreFocus.current = true; onEnd(); }}><PhoneOff aria-hidden="true" />{state === "cleanup_failed" ? t("upgrade1029NewComponents.voiceControls.retryEnd") : t("upgrade1029NewComponents.spekoCallHistory.endCall")}</Button>
          </>
        )}
        {canRepeat && onRepeat && !inactive && <Button size="sm" variant="outline" disabled={busy || connecting || state === "ending" || state === "cleanup_failed"} onClick={onRepeat}><RotateCcw aria-hidden="true" />{t("upgrade1029NewComponents.voiceControls.repeat")}</Button>}
        {playbackBlocked && !inactive && <Button size="sm" variant="outline" onClick={onResumeAudio}><Volume2 aria-hidden="true" />{t("upgrade1029NewComponents.voiceControls.enableAudio")}</Button>}
      </div>
      {!inactive && <p className="text-xs text-muted-foreground">{t("upgrade1029NewComponents.voiceControls.endingNote")}</p>}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
    </section>
  );
}
