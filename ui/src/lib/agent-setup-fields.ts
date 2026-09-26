import { t as tNewUi } from "@/i18n";
import { DEFAULT_CODEX_LOCAL_MODEL } from "@paperclipai/adapter-codex-local";
import { claudeLocalReasoningEffortsForModel, DEFAULT_CLAUDE_LOCAL_MODEL } from "@paperclipai/adapter-claude-local";
import { grokLocalReasoningEffortsForModel } from "@paperclipai/adapter-grok-local";
import { codexReasoningEffortOptions } from "./codex-reasoning-effort";
import { PROVIDER_ENV_KEYS } from "./provider-credential";

/** Only controls consumed by each adapter's config builder and runtime belong here. */
export const SETUP_CREDENTIAL_KEYS: Record<string, string> = {
  cursor: "CURSOR_API_KEY",
  cursor_cloud: "CURSOR_API_KEY",
  gemini_local: "GEMINI_API_KEY",
  kimi_local: "KIMI_MODEL_API_KEY",
  hermes_gateway: "API_SERVER_KEY",
};

export const HERMES_PROVIDER_KEYS: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  zai: "ZAI_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  minimax: "MINIMAX_API_KEY",
};

export function setupProviderKeys(adapter: string) {
  return adapter === "hermes_local" ? HERMES_PROVIDER_KEYS : PROVIDER_ENV_KEYS;
}

export function setupEfforts(adapter: string, model = ""): string[] {
  switch (adapter) {
    case "claude_local":
      return [...claudeLocalReasoningEffortsForModel(model || DEFAULT_CLAUDE_LOCAL_MODEL)];
    case "codex_local":
      return codexReasoningEffortOptions(model || DEFAULT_CODEX_LOCAL_MODEL)
        .map((option) => option.value)
        .filter(Boolean);
    case "pi_local":
      return ["off", "minimal", "low", "medium", "high", "xhigh"];
    case "grok_local":
      return [...grokLocalReasoningEffortsForModel(model)];
    default:
      return [];
  }
}

export const SETUP_LOGIN_HINTS: Record<string, string> = {
  cursor:
    tNewUi("newUi.kbf0389f2e12d"),
  gemini_local:
    tNewUi("newUi.k24d052462515"),
  kimi_local:
    tNewUi("newUi.k19af818766f1"),
  grok_local:
    tNewUi("newUi.k8bee3e82aa82"),
  hermes_local:
    tNewUi("newUi.k04cbc3ef148c"),
};
