import { t as tNewUi } from "@/i18n";
import {
  codexLocalReasoningEffortsForModel,
  type CodexLocalReasoningEffort,
} from "@paperclipai/adapter-codex-local";

const CODEX_REASONING_EFFORT_LABELS: Record<CodexLocalReasoningEffort, string> = {
  minimal: tNewUi("newUi.k057b5de48d7b"),
  low: tNewUi("newUi.kf793de205ead"),
  medium: tNewUi("newUi.k8e588cd18774"),
  high: tNewUi("newUi.kc4ebc6d4a583"),
  xhigh: "X-High",
  max: tNewUi("newUi.ka1a5936d3b0f"),
  ultra: tNewUi("newUi.kac364e1afdd7"),
};

export function codexReasoningEffortOptions(
  model: string | null | undefined,
  defaultLabel = tNewUi("newUi.k21b111cbfe6e"),
) {
  return [
    { value: "", label: defaultLabel },
    ...codexLocalReasoningEffortsForModel(model).map((value) => ({
      value,
      label: CODEX_REASONING_EFFORT_LABELS[value],
    })),
  ];
}
