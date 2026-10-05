type ModelFamily = "gpt" | "claude";

function adapterModelFamily(adapterType: string): ModelFamily | null {
  if (adapterType === "hermes_local" || adapterType === "codex_local") return "gpt";
  if (adapterType === "claude_local") return "claude";
  return null;
}

// Legacy overrides carry no adapter provenance. Be conservative for the three
// fixed-family adapters; aliases and future model names need explicit support.
function modelFamily(model: unknown): ModelFamily | null {
  if (typeof model !== "string") return null;
  const name = model.trim().toLowerCase();
  if (/^(?:anthropic\/)?claude-/.test(name)) return "claude";
  if (/^(?:openai\/)?(?:gpt-|o\d+(?:-|$))/.test(name)) return "gpt";
  return null;
}

export function resolveIssueAdapterConfigOverride(
  adapterConfig: Record<string, unknown> | null,
  adapterType: string,
): {
  adapterConfig: Record<string, unknown> | null;
  skippedReasons: string[];
} {
  if (!adapterConfig) return { adapterConfig: null, skippedReasons: [] };
  const config = { ...adapterConfig };
  const skippedReasons: string[] = [];
  // Removed runtime model profiles must never be revived by reopening old tasks.
  if (Object.prototype.hasOwnProperty.call(config, "modelProfile")) {
    delete config.modelProfile;
    skippedReasons.push("obsolete_model_profile");
  }
  const expectedFamily = adapterModelFamily(adapterType);
  if (expectedFamily && Object.prototype.hasOwnProperty.call(config, "model")) {
    const requestedFamily = modelFamily(config.model);
    if (!requestedFamily || requestedFamily !== expectedFamily) {
      skippedReasons.push(requestedFamily ? "model_family_mismatch" : "unknown_model_family");
      return { adapterConfig: null, skippedReasons };
    }
  }
  return {
    adapterConfig: Object.keys(config).length > 0 ? config : null,
    skippedReasons,
  };
}
