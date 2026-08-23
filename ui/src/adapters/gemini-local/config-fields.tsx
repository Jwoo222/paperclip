import type { AdapterConfigFieldsProps } from "../types";
import {
  DraftNumberInput,
  DraftInput,
  Field,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { t } from "@/i18n";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
export function GeminiLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const rawEngine = isCreate
    ? values!.geminiEngine ?? "auto"
    : eff("adapterConfig", "engine", String(config.engine ?? "auto"));
  const engine = rawEngine === "acp" || rawEngine === "cli" ? rawEngine : "auto";
  const acpSelected = engine === "acp";

  return (
    <>
      <Field label={t("adapterTools.common.executionEngine")} hint={t("adapterTools.common.autoHint", { cli: "Gemini" })}>
        <select
          className={inputClass}
          value={engine}
          onChange={(e) => {
            const value = e.target.value === "acp" ? "acp" : e.target.value === "cli" ? "cli" : "auto";
            isCreate
              ? set!({ geminiEngine: value })
              : mark("adapterConfig", "engine", value === "auto" ? undefined : value);
          }}
        >
          <option value="auto">{t("adapterTools.common.autoAcp")}</option>
          <option value="cli">{t("adapterTools.common.cli", { name: "Gemini" })}</option>
          <option value="acp">{t("adapterTools.common.acp")}</option>
        </select>
      </Field>
      {acpSelected && (
        <>
          <Field
            label={t("adapterTools.common.acpServerCommand")}
            hint={t("adapterTools.common.acpServerHint", { name: "Gemini", command: "gemini --acp" })}
          >
            <DraftInput
              value={
                isCreate
                  ? values!.geminiAcpAgentCommand ?? ""
                  : eff("adapterConfig", "agentCommand", String(config.agentCommand ?? ""))
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ geminiAcpAgentCommand: v })
                  : mark("adapterConfig", "agentCommand", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="gemini --acp"
            />
          </Field>
          <Field label={t("adapterTools.common.acpSessionMode")} hint={t("adapterTools.common.acpSessionHint")}>
            <select
              className={inputClass}
              value={
                isCreate
                  ? values!.geminiAcpMode ?? "persistent"
                  : eff("adapterConfig", "mode", String(config.mode ?? "persistent"))
              }
              onChange={(e) => {
                const value = e.target.value === "oneshot" ? "oneshot" : "persistent";
                isCreate
                  ? set!({ geminiAcpMode: value })
                  : mark("adapterConfig", "mode", value);
              }}
            >
              <option value="persistent">{t("adapterTools.common.persistent")}</option>
              <option value="oneshot">{t("adapterTools.common.oneShot")}</option>
            </select>
          </Field>
          <Field
            label={t("adapterTools.common.acpPermissions")}
            hint={t("adapterTools.common.acpPermissionsHint")}
          >
            <select
              className={inputClass}
              value={
                isCreate
                  ? values!.geminiAcpNonInteractivePermissions ?? "deny"
                  : eff("adapterConfig", "nonInteractivePermissions", String(config.nonInteractivePermissions ?? "deny"))
              }
              onChange={(e) => {
                const value = e.target.value === "fail" ? "fail" : "deny";
                isCreate
                  ? set!({ geminiAcpNonInteractivePermissions: value })
                  : mark("adapterConfig", "nonInteractivePermissions", value);
              }}
            >
              <option value="deny">{t("adapterTools.common.deny")}</option>
              <option value="fail">{t("adapterTools.common.fail")}</option>
            </select>
          </Field>
          <Field
            label={t("adapterTools.common.acpStateDirectory")}
            hint={t("adapterTools.common.acpStateHint")}
          >
            <div className="flex items-center gap-2">
              <DraftInput
                value={
                  isCreate
                    ? values!.geminiAcpStateDir ?? ""
                    : eff("adapterConfig", "stateDir", String(config.stateDir ?? ""))
                }
                onCommit={(v) =>
                  isCreate
                    ? set!({ geminiAcpStateDir: v })
                    : mark("adapterConfig", "stateDir", v || undefined)
                }
                immediate
                className={inputClass}
                placeholder="/path/to/acp-state"
              />
              <ChoosePathButton />
            </div>
          </Field>
          <Field
            label={t("adapterTools.common.acpWarmIdle")}
            hint={t("adapterTools.common.acpWarmHint")}
          >
            {isCreate ? (
              <input
                type="number"
                className={inputClass}
                value={values!.geminiAcpWarmHandleIdleMs ?? 0}
                onChange={(e) => set!({ geminiAcpWarmHandleIdleMs: Number(e.target.value) })}
              />
            ) : (
              <DraftNumberInput
                value={eff(
                  "adapterConfig",
                  "warmHandleIdleMs",
                  Number(config.warmHandleIdleMs ?? 0),
                )}
                onCommit={(v) => mark("adapterConfig", "warmHandleIdleMs", v || 0)}
                immediate
                className={inputClass}
              />
            )}
          </Field>
        </>
      )}
      {!hideInstructionsFile && (
        <Field label={t("adapterTools.common.instructionsFile")} hint={t("adapterTools.common.instructionsHint")}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
    </>
  );
}
