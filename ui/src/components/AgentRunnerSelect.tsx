import type { AgentRunner, AgentRunnerChoice } from "@paperclipai/shared";
import { Field } from "./agent-config-primitives";
import { SelectPopover } from "./ui/select";
import { Button } from "./ui/button";
import { t } from "@/i18n";

export function AgentRunnerSelect({
  value,
  onChange,
  defaultRunner,
  supportedRunners = ["legacy"],
  disabled,
  pending,
  error,
  onRetry,
}: {
  value: AgentRunnerChoice;
  onChange: (value: AgentRunnerChoice) => void;
  defaultRunner?: AgentRunner;
  supportedRunners?: readonly AgentRunner[];
  disabled?: boolean;
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <Field label={t("newUi.k2184a4e3f4ce")}>
      <SelectPopover
        aria-label={t("newUi.k2184a4e3f4ce")}
        disabled={disabled}
        value={value}
        displayValue={value === "auto" ? (defaultRunner ? t("upgrade1029NewComponents.agentRunnerSelect.withDefault", { runner: defaultRunner === "paperclip" ? "Paperclip Runner" : t("upgrade1029NewComponents.agentRunnerSelect.legacyRunner") }) : pending ? t("upgrade1029NewComponents.agentRunnerSelect.checkingAvailability") : t("upgrade1029NewComponents.agentRunnerSelect.automaticUnavailable")) : undefined}
        onValueChange={next => onChange(next as AgentRunnerChoice)}
        options={[
          { value: "paperclip", label: defaultRunner === "paperclip" ? t("upgrade1029NewComponents.agentRunnerSelect.withDefault", { runner: "Paperclip Runner" }) : "Paperclip Runner", disabled: !supportedRunners.includes("paperclip") && value !== "paperclip" },
          { value: "legacy", label: defaultRunner === "legacy" ? t("upgrade1029NewComponents.agentRunnerSelect.withDefault", { runner: t("upgrade1029NewComponents.agentRunnerSelect.legacyRunner") }) : t("upgrade1029NewComponents.agentRunnerSelect.legacyRunner"), disabled: !supportedRunners.includes("legacy") && value !== "legacy" },
        ]}
      />
      {error && <div className="mt-2 space-y-2">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        {onRetry && <Button type="button" variant="outline" size="sm" disabled={pending || disabled} onClick={onRetry}>{t("upgrade1029NewComponents.agentRunnerSelect.retryDiscovery")}</Button>}
      </div>}
    </Field>
  );
}
