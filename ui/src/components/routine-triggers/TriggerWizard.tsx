import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  AlertCircle,
  Globe,
  GitBranch,
  Radio,
  Webhook,
} from "lucide-react";
import {
  SetupWizardNavigation,
  SetupWizardFooter,
} from "@/components/SetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import { AgentInstructions, CopyField } from "./WebhookFields";
import { WebhookUrlWarning } from "./WebhookUrlWarning";

export type TriggerDraft = {
  kind: "choose" | "schedule" | "webhook";
  step: number;
  availableStep: number;
  sender: "custom" | "github";
  /** Retained when resuming webhooks created before generic signed-app support. */
  signingMode?: "bearer" | "app_webhook" | "fireflies_hmac";
  frequency: string;
  time: string;
  weekday: string;
  timezone: string;
  created: boolean;
};
export const defaultTriggerDraft: TriggerDraft = {
  kind: "choose",
  step: 0,
  availableStep: 0,
  sender: "custom",
  frequency: "weekdays",
  time: "09:00",
  weekday: tNewUi("newUi.k6a00dfc1dc86"),
  timezone: "America/Chicago",
  created: false,
};
export function webhookAgentInstructions(
  sender: TriggerDraft["sender"],
  routineTitle: string,
  webhookUrl: string,
  webhookSecret: string,
  setupPending = true,
  signingMode: TriggerDraft["signingMode"] = "app_webhook",
) {
  const common = [
    `Connect the sending app to the Paperclip routine ${JSON.stringify(routineTitle)}.`,
    `Webhook URL: ${webhookUrl}`,
    tNewUi("newUi.k3c5b448f917c"),
    "Content-Type: application/json",
  ];
  const auth =
    sender === "github"
      ? [
          tNewUi("newUi.k7c979fbab1c6"),
          tNewUi("newUi.k384bbb8f68ce"),
          `Secret: ${webhookSecret}`,
          tNewUi("newUi.kd27a57dbfb31"),
          tNewUi("newUi.k8609607f46fc"),
          tNewUi("newUi.k6695bde37c52"),
        ]
      : [
          `Secret key: ${webhookSecret}`,
          ...(signingMode === "bearer" ? [] : [
            `If the app asks for a signing secret, paste the secret key above. Paperclip accepts HMAC-SHA256 over the exact request body in ${signingMode === "fireflies_hmac" ? "X-Hub-Signature" : "X-Hub-Signature or X-Hub-Signature-256"}, formatted sha256=<hex digest>.`,
          ]),
          ...(signingMode === "fireflies_hmac" ? [] : [
            `For apps with custom headers, use Authorization: Bearer ${webhookSecret}`,
          ]),
          tNewUi("newUi.k13d595cef285"),
          tNewUi("newUi.k0961cd3fd5cf"),
          tNewUi("newUi.k474767e9e003"),
          tNewUi("newUi.k8d7ed6c27b18"),
          tNewUi("newUi.k5b878fdca162"),
        ];
  return [
    ...common,
    ...auth,
    tNewUi("newUi.k8169927f229a"),
    ...(setupPending
      ? [
          tNewUi("newUi.kcca576207b7f"),
          tNewUi("newUi.k6c91acb9906b"),
        ]
      : [
          tNewUi("newUi.k4e20fe54213c"),
        ]),
    tNewUi("newUi.k0eb7346125c1"),
  ].join("\n");
}
export function describeSchedule(draft: TriggerDraft) {
  return `${draft.frequency === "daily" ? tNewUi("newUi.kc4e42b974c33") : draft.frequency === "weekly" ? `Every ${draft.weekday}` : tNewUi("newUi.k88bbcc667726")} at ${draft.time}`;
}
export function RoutineTriggerWizard({
  initialDraft,
  onSaveExit,
  onFinish,
  onCreateWebhook,
  onRotateKey,
  routineTitle,
  routineId,
  routineActive = true,
  webhookUrl = "",
  webhookSecret = "",
  checkResult = "waiting",
}: {
  initialDraft: TriggerDraft;
  routineTitle: string;
  routineId: string;
  routineActive?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  onCreateWebhook?: (draft: TriggerDraft) => Promise<void>;
  onRotateKey?: () => Promise<void>;
  onSaveExit: (draft: TriggerDraft) => void | Promise<void>;
  onFinish: (draft: TriggerDraft) => void | Promise<void>;
  checkResult?: "waiting" | "received" | "rejected" | "no_event";
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { setBreadcrumbs } = useBreadcrumbs();
  const perform = useCallback(
    async (action: () => void | Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setSaveError("");
      try {
        await action();
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : tNewUi("newUi.k167618069b26"),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );
  const saveAndExit = useCallback(() => {
    void perform(() => onSaveExit(draft));
  }, [draft, onSaveExit, perform]);
  useEffect(() => {
    setBreadcrumbs([
      {
        label: routineTitle,
        href: `/routines/${routineId}/triggers`,
        onClick: (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          saveAndExit();
        },
      },
      { label: tNewUi("newUi.k58fd308928dd") },
    ]);
  }, [saveAndExit, setBreadcrumbs, routineTitle, routineId]);
  const schedule = draft.kind === "schedule";
  const github = draft.sender === "github";
  const labels = schedule
    ? [tNewUi("newUi.kc28f22128246"), tNewUi("newUi.k221856754468"), tNewUi("newUi.k98c00356c056")]
    : [tNewUi("newUi.kc28f22128246"), tNewUi("newUi.k41db7f95f1d2"), tNewUi("newUi.kbe5dff52eeb0")];
  function patch(values: Partial<TriggerDraft>) {
    setDraft((current) => ({ ...current, ...values }));
  }
  function advance() {
    void perform(async () => {
      if (draft.kind === "webhook" && draft.step === 0 && !draft.created)
        await onCreateWebhook?.(draft);
      const step = draft.step + 1;
      patch({
        step,
        availableStep: Math.max(draft.availableStep, step),
        created:
          draft.created || (draft.kind === "webhook" && draft.step === 0),
      });
    });
  }
  const title =
    draft.step === 0
      ? tNewUi("newUi.k7725656f0881")
      : schedule
        ? draft.step === 1
          ? "Set a schedule"
          : tNewUi("newUi.k6204c309b82b")
        : draft.step === 1
          ? `Connect ${github ? "GitHub" : tNewUi("newUi.k4696a33536d7")}`
          : tNewUi("newUi.kc2886bc3844e");
  const subtitle =
    draft.step === 0
      ? `Choose how to start “${routineTitle}”. You can add another trigger later.`
      : schedule
        ? draft.step === 1
          ? tNewUi("newUi.k3cca3d7f0ef4")
          : tNewUi("newUi.kb549efc6d146")
        : draft.step === 1
          ? tNewUi("newUi.k7eaa5d9053a0")
          : tNewUi("newUi.k57926d6a5247");
  const selectClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  const goBack = (
    <Button variant="outline" onClick={() => patch({ step: draft.step - 1 })}>
      {t("skillStudio.back")}
    </Button>
  );
  return (
    <div className="min-w-0 w-full max-w-2xl space-y-6">
      <SetupWizardNavigation
        takeover
        disabled={busy}
        ariaLabel={tNewUi("newUi.k0e99f6bb5703")}
        labels={labels}
        step={draft.step}
        availableStep={draft.availableStep}
        onSelect={(step) => patch({ step })}
      />
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {!schedule && draft.step > 0 && <WebhookUrlWarning url={webhookUrl} />}
        {draft.step === 0 && (
          <fieldset className="space-y-3">
            <legend className="sr-only">{tNewUi("newUi.k31a9d2bd7aed")}</legend>
            {(
              [
                {
                  kind: "schedule",
                  label: "On a schedule",
                  detail: tNewUi("newUi.k0ae8852bc376"),
                  Icon: CalendarClock,
                },
                {
                  kind: "webhook",
                  label: tNewUi("newUi.kd7f97da16118"),
                  detail:
                    tNewUi("newUi.k359218e15082"),
                  Icon: Webhook,
                },
              ] as const
            ).map(({ kind, label, detail, Icon }) => (
              <label
                key={kind}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-4 focus-within:ring-2 focus-within:ring-ring",
                  draft.kind === kind
                    ? "border-primary bg-accent/30"
                    : "border-border hover:bg-accent/20",
                )}
              >
                <input
                  type="radio"
                  name="trigger-kind"
                  checked={draft.kind === kind}
                  disabled={draft.created && kind !== draft.kind}
                  onChange={() =>
                    patch({
                      kind,
                      availableStep:
                        kind === draft.kind ? draft.availableStep : 0,
                    })
                  }
                  className="sr-only"
                />
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {detail}
                  </span>
                </span>
                {draft.kind === kind && <Check className="h-4 w-4" />}
              </label>
            ))}
          </fieldset>
        )}
        {schedule && draft.step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="repeat">{tNewUi("newUi.kb6b7a0065808")}</Label>
                <select
                  id="repeat"
                  className={selectClass}
                  value={draft.frequency}
                  onChange={(event) => patch({ frequency: event.target.value })}
                >
                  <option value="daily">{t("routinesExtra.schedule.preset.everyDay")}</option>
                  <option value="weekdays">{tNewUi("newUi.k0ea2df5ff8ad")}</option>
                  <option value="weekly">{tNewUi("newUi.k1b7e18513af4")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-time">{tNewUi("newUi.k33b93476cf59")}</Label>
                <Input
                  id="run-time"
                  type="time"
                  value={draft.time}
                  onChange={(event) => patch({ time: event.target.value })}
                />
              </div>
            </div>
            {draft.frequency === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="run-day">{tNewUi("newUi.k8f2364e11b8b")}</Label>
                <select
                  id="run-day"
                  className={selectClass}
                  value={draft.weekday}
                  onChange={(event) => patch({ weekday: event.target.value })}
                >
                  {[
                    tNewUi("newUi.k6a00dfc1dc86"),
                    tNewUi("newUi.k7d8af1de1262"),
                    tNewUi("newUi.kc0a6cc829cd0"),
                    tNewUi("newUi.kfc2662062ffd"),
                    tNewUi("newUi.ke21f3f372a46"),
                    tNewUi("newUi.kdbe35c7363c2"),
                    tNewUi("newUi.k873fef760e5d"),
                  ].map((day) => (
                    <option key={day}>{day}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="timezone">{tNewUi("newUi.kb9fe1464783e")}</Label>
              <select
                id="timezone"
                className={selectClass}
                value={draft.timezone}
                onChange={(event) => patch({ timezone: event.target.value })}
              >
                {Array.from(
                  new Set([
                    draft.timezone,
                    "America/Chicago",
                    "America/New_York",
                    "America/Los_Angeles",
                    "Europe/London",
                    "UTC",
                  ]),
                ).map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {tNewUi("newUi.kea2bf434668f")}
              </p>
            </div>
          </div>
        )}
        {schedule && draft.step === 2 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-md bg-muted/40 p-4">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{describeSchedule(draft)}</p>
                <p className="text-xs text-muted-foreground">
                  {draft.timezone}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {tNewUi("newUi.k86832688d737")}
            </p>
          </div>
        )}
        {draft.step === 0 && draft.kind === "webhook" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {tNewUi("newUi.k850bfd5b6f32")}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    sender: "custom",
                    label: tNewUi("newUi.k3368721465f9"),
                    Icon: Globe,
                  },
                  { sender: "github", label: "GitHub", Icon: GitBranch },
                ] as const
              ).map(({ sender, label, Icon }) => (
                <label
                  key={sender}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border p-3 focus-within:ring-2 focus-within:ring-ring",
                    draft.sender === sender
                      ? "border-primary bg-accent/30"
                      : "border-border",
                    draft.created && "cursor-default",
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="sender"
                    checked={draft.sender === sender}
                    disabled={draft.created}
                    onChange={() => patch({ sender })}
                  />
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-sm">{label}</span>
                  {draft.sender === sender && <Check className="h-4 w-4" />}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {draft.kind === "webhook" && draft.step === 0 && (
          <p className="text-sm text-muted-foreground">
            {tNewUi("newUi.k090e88c6260e")}
          </p>
        )}
        {!schedule && draft.step === 1 && (
          <div className="space-y-5">
            {webhookSecret && (
              <AgentInstructions
                value={webhookAgentInstructions(
                  draft.sender,
                  routineTitle,
                  webhookUrl,
                  webhookSecret,
                  true,
                  draft.signingMode,
                )}
              />
            )}
            <CopyField
              label={github ? tNewUi("newUi.k1de5cdcfa7ca") : tNewUi("newUi.k84805a7574a8")}
              value={webhookUrl}
            />
            {!github && draft.signingMode !== "bearer" && (
              <p className="text-sm text-muted-foreground">
                {tNewUi("newUi.k3dd90f15925b")}
                {draft.signingMode !== "fireflies_hmac" && <>
                  {" "}{tNewUi("newUi.k6ab05c2ac138")}
                </>}
              </p>
            )}
            {webhookSecret ? (
              <CopyField
                label={github ? tNewUi("newUi.k7e32a729b122") : draft.signingMode === "bearer" ? tNewUi("newUi.k39a91b3db30e") : tNewUi("newUi.kf47a99ebcf29")}
                value={!github && draft.signingMode === "bearer" ? `Bearer ${webhookSecret}` : webhookSecret}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {tNewUi("newUi.kcbe8a3a10ee3")}
                </p>
                <Button
                  variant="outline"
                  onClick={() => void perform(() => onRotateKey?.())}
                >
                  {tNewUi("newUi.k3a14b7bb1a2d")}
                </Button>
              </div>
            )}
          </div>
        )}
        {!schedule && draft.step === 2 && (
          <div className="space-y-5">
            <div className="space-y-1 rounded-md border border-border p-4">
              <p className="text-sm font-medium">{tNewUi("newUi.kfd7045f15f97")}</p>
              <p className="text-sm text-muted-foreground">
                {tNewUi("newUi.k8fcae13d94e6")}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {tNewUi("newUi.kaf0f9889db03")} {github ? "GitHub" : tNewUi("newUi.k4696a33536d7")}
              </p>
              <p className="text-sm text-muted-foreground">
                {github
                  ? tNewUi("newUi.ke2c845a58aac")
                  : tNewUi("newUi.k643e56b82219")}
              </p>
              <p className="text-xs text-muted-foreground">
                {tNewUi("newUi.kf5c741548eae")}
              </p>
            </div>
            <div
              role="status"
              className="flex items-start gap-3 rounded-md bg-muted/40 p-4"
            >
              {checkResult === "received" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-(--status-task-done)" />
              ) : checkResult === "rejected" ? (
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              ) : (
                <Radio className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {checkResult === "received"
                    ? tNewUi("newUi.kb57a6eee90b0")
                    : checkResult === "rejected"
                      ? tNewUi("newUi.k8ac7b7edc6a0")
                      : checkResult === "no_event"
                        ? tNewUi("newUi.k4d6fd6a8ec99")
                        : tNewUi("newUi.k6da2e8bcc917")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {checkResult === "received"
                    ? tNewUi("newUi.k407050a5a842")
                    : checkResult === "rejected"
                      ? tNewUi("newUi.kd5b974d7c1eb")
                      : tNewUi("newUi.kf29bb26ef7a2")}
                </p>
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {tNewUi("newUi.kf854de0340ea")}
              </summary>
              <div className="space-y-3 pt-3">
                <p className="text-xs text-muted-foreground">
                  {tNewUi("newUi.k2a40b44d6d75")}
                </p>
                <CopyField label={t("onboardingResidual.webhookUrl")} value={webhookUrl} />
              </div>
            </details>
          </div>
        )}
        {!schedule && draft.step === 2 && (
          <p className="text-xs text-muted-foreground">
            {routineActive
              ? tNewUi("newUi.k391fff2bae3c")
              : tNewUi("newUi.k7580f0663983")}
          </p>
        )}
        {schedule && draft.step === 2 && !routineActive && (
          <p className="text-sm text-muted-foreground">
            {tNewUi("newUi.k488079220c35")}
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        <SetupWizardFooter onSaveExit={saveAndExit}>
          {draft.step > 0 && goBack}
          {draft.step === 0 ? (
            <Button disabled={draft.kind === "choose"} onClick={advance}>
              {t("toolsResidualRound2.continue")}
            </Button>
          ) : schedule ? (
            draft.step === 1 ? (
              <Button disabled={!draft.time} onClick={advance}>
                {tNewUi("newUi.k98c00356c056")}
              </Button>
            ) : (
              <Button onClick={() => void perform(() => onFinish(draft))}>
                {tNewUi("newUi.k79218735c296")}
              </Button>
            )
          ) : draft.step === 1 ? (
            <Button onClick={advance}>{tNewUi("newUi.kbe5dff52eeb0")}</Button>
          ) : (
            <Button onClick={() => void perform(() => onFinish(draft))}>
              {checkResult === "received"
                ? tNewUi("newUi.kbc01ae77f37c")
                : tNewUi("newUi.kccfc47b4b1a3")}
            </Button>
          )}
        </SetupWizardFooter>
      </fieldset>
    </div>
  );
}
