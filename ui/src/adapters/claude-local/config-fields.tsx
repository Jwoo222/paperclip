import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  ToggleField,
  DraftInput,
  DraftNumberInput,
  help,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";
import { t } from "@/i18n";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function ClaudeLocalConfigFields({
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  return (
    <>
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
      <LocalWorkspaceRuntimeFields
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
        eff={eff}
        mode={mode}
        adapterType={adapterType}
        models={models}
      />
    </>
  );
}

export function ClaudeLocalAdvancedFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const rawEngine = isCreate
    ? values!.claudeEngine ?? "auto"
    : eff("adapterConfig", "engine", String(config.engine ?? "auto"));
  const engine = rawEngine === "acp" || rawEngine === "cli" ? rawEngine : "auto";
  const acpSelected = engine === "acp";

  return (
    <>
      <Field label={t("adapterTools.common.executionEngine")} hint={t("adapterTools.common.autoHint", { cli: "Claude" })}>
        <select
          className={inputClass}
          value={engine}
          onChange={(e) => {
            const value = e.target.value === "acp" ? "acp" : e.target.value === "cli" ? "cli" : "auto";
            isCreate
              ? set!({ claudeEngine: value })
              : mark("adapterConfig", "engine", value === "auto" ? undefined : value);
          }}
        >
          <option value="auto">{t("adapterTools.common.autoAcp")}</option>
          <option value="cli">{t("adapterTools.common.cli", { name: "Claude" })}</option>
          <option value="acp">{t("adapterTools.common.acp")}</option>
        </select>
      </Field>
      {acpSelected && (
        <>
          <Field
            label={t("adapterTools.common.acpServerCommand")}
            hint={t("adapterTools.common.acpServerHint", { name: "Claude", command: "claude-agent-acp" })}
          >
            <DraftInput
              value={
                isCreate
                  ? values!.claudeAcpAgentCommand ?? ""
                  : eff("adapterConfig", "agentCommand", String(config.agentCommand ?? ""))
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ claudeAcpAgentCommand: v })
                  : mark("adapterConfig", "agentCommand", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="claude-agent-acp"
            />
          </Field>
          <Field label={t("adapterTools.common.acpSessionMode")} hint={t("adapterTools.common.acpSessionHint")}>
            <select
              className={inputClass}
              value={
                isCreate
                  ? values!.claudeAcpMode ?? "persistent"
                  : eff("adapterConfig", "mode", String(config.mode ?? "persistent"))
              }
              onChange={(e) => {
                const value = e.target.value === "oneshot" ? "oneshot" : "persistent";
                isCreate
                  ? set!({ claudeAcpMode: value })
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
                  ? values!.claudeAcpNonInteractivePermissions ?? "deny"
                  : eff("adapterConfig", "nonInteractivePermissions", String(config.nonInteractivePermissions ?? "deny"))
              }
              onChange={(e) => {
                const value = e.target.value === "fail" ? "fail" : "deny";
                isCreate
                  ? set!({ claudeAcpNonInteractivePermissions: value })
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
                    ? values!.claudeAcpStateDir ?? ""
                    : eff("adapterConfig", "stateDir", String(config.stateDir ?? ""))
                }
                onCommit={(v) =>
                  isCreate
                    ? set!({ claudeAcpStateDir: v })
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
                value={values!.claudeAcpWarmHandleIdleMs ?? 0}
                onChange={(e) => set!({ claudeAcpWarmHandleIdleMs: Number(e.target.value) })}
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
      <ToggleField
        label={t("adapterTools.claude.enableChrome")}
        hint={help.chrome}
        checked={
          isCreate
            ? values!.chrome
            : eff("adapterConfig", "chrome", config.chrome === true)
        }
        onChange={(v) =>
          isCreate
            ? set!({ chrome: v })
            : mark("adapterConfig", "chrome", v)
        }
      />
      <ToggleField
        label={t("adapterTools.claude.skipPermissions")}
        hint={help.dangerouslySkipPermissions}
        checked={
          isCreate
            ? values!.dangerouslySkipPermissions
            : eff(
                "adapterConfig",
                "dangerouslySkipPermissions",
                config.dangerouslySkipPermissions !== false,
              )
        }
        onChange={(v) =>
          isCreate
            ? set!({ dangerouslySkipPermissions: v })
            : mark("adapterConfig", "dangerouslySkipPermissions", v)
        }
      />
      <Field label={t("adapterTools.claude.maxTurns")} hint={help.maxTurnsPerRun}>
        {isCreate ? (
          <input
            type="number"
            className={inputClass}
            value={values!.maxTurnsPerRun}
            onChange={(e) => set!({ maxTurnsPerRun: Number(e.target.value) })}
          />
        ) : (
          <DraftNumberInput
            value={eff(
              "adapterConfig",
              "maxTurnsPerRun",
              Number(config.maxTurnsPerRun ?? 1000),
            )}
            onCommit={(v) => mark("adapterConfig", "maxTurnsPerRun", v || 1000)}
            immediate
            className={inputClass}
          />
        )}
      </Field>
    </>
  );
}
