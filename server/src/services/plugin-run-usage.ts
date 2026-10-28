import type { PluginIssueRunSummary } from "@paperclipai/plugin-sdk";

type PluginRunFinancialUsage = NonNullable<PluginIssueRunSummary["financialUsage"]>;

/**
 * Allowlisted scalars read from one heartbeat run for the plugin
 * orchestration summary. Values come straight from jsonb `->` projections, so
 * each one may be any JSON type (or null) and is validated here. Session IDs,
 * log text and the full usage/result documents are never part of this input.
 */
export interface RunUsageScalars {
  status: string;
  adapterType: string | null;
  hasUsageRecord: boolean;
  hasSessionIdBefore: boolean;
  provider: unknown;
  biller: unknown;
  model: unknown;
  costUsd: unknown;
  inputTokens: unknown;
  cachedInputTokens: unknown;
  outputTokens: unknown;
  usageSource: unknown;
  freshSession: unknown;
  sessionReused: unknown;
  taskSessionReused: unknown;
  resultType: unknown;
  resultTotalCostUsd: unknown;
  /** Per-model numeric buckets from result_json.modelUsage; model names are dropped. */
  modelUsage: unknown;
}

const SHORT_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@+\-[\]]{0,99}$/;

function readIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "unknown") return null;
  return SHORT_IDENTIFIER.test(trimmed) ? trimmed : null;
}

function readNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readTokenCount(value: unknown): number | null {
  const parsed = readNonNegative(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

interface ModelUsageBuckets {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Sum Claude CLI modelUsage buckets. Any non-object entry or non-integer
 * field rejects the whole breakdown instead of treating it as 0.
 */
function readModelUsageBuckets(value: unknown): ModelUsageBuckets | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const totals: ModelUsageBuckets = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    const input = readTokenCount(record.inputTokens);
    const output = readTokenCount(record.outputTokens);
    const cacheRead = readTokenCount(record.cacheReadInputTokens);
    const cacheWrite = readTokenCount(record.cacheCreationInputTokens);
    if (input === null || output === null || cacheRead === null || cacheWrite === null) return null;
    totals.input += input;
    totals.output += output;
    totals.cacheRead += cacheRead;
    totals.cacheWrite += cacheWrite;
  }
  return totals;
}

function resolveResumed(input: RunUsageScalars): boolean | null {
  if (
    input.hasSessionIdBefore
    || input.sessionReused === true
    || input.taskSessionReused === true
    || input.freshSession === false
  ) {
    return true;
  }
  if (input.freshSession === true && input.sessionReused === false && input.taskSessionReused === false) {
    return false;
  }
  return null;
}

/**
 * Project one run's stored usage into the plugin-safe contract. Returns null
 * when the run has no usage record at all.
 */
export function projectRunFinancialUsage(input: RunUsageScalars): PluginRunFinancialUsage | null {
  if (!input.hasUsageRecord) return null;

  const succeeded = input.status === "succeeded";
  const resumed = resolveResumed(input);
  const usageSource = input.usageSource === "per_run" || input.usageSource === "session_delta"
    ? input.usageSource
    : null;
  const costScope: PluginRunFinancialUsage["costScope"] =
    succeeded && resumed === false && usageSource !== "session_delta" ? "fresh_session" : "unconfirmed";

  const provider = readIdentifier(input.provider);
  const storedCostUsd = readNonNegative(input.costUsd);
  const resultTotalCostUsd = readNonNegative(input.resultTotalCostUsd);
  // The claude_local adapter copies the CLI result's total_cost_usd into
  // costUsd; only that exact pairing is a CLI price-table estimate.
  const estimateSource: PluginRunFinancialUsage["estimateSource"] =
    input.adapterType === "claude_local"
    && provider === "anthropic"
    && input.biller === "anthropic"
    && input.resultType === "result"
    && storedCostUsd !== null
    && resultTotalCostUsd !== null
    && storedCostUsd === resultTotalCostUsd
      ? "claude_cli_price_table"
      : "unknown";

  const storedInput = readTokenCount(input.inputTokens);
  const storedCacheRead = readTokenCount(input.cachedInputTokens);
  const storedOutput = readTokenCount(input.outputTokens);
  const tokensComplete = storedInput !== null && storedCacheRead !== null && storedOutput !== null;

  let tokens: Pick<PluginRunFinancialUsage, "input" | "output" | "cacheRead" | "cacheWrite" | "inputIncludesCacheWrite">;
  const buckets = input.adapterType === "claude_local" ? readModelUsageBuckets(input.modelUsage) : null;
  // claude_local stores input = modelUsage input + cache creation. Split only
  // when the stored totals reproduce exactly from the same modelUsage.
  if (
    buckets
    && storedInput === buckets.input + buckets.cacheWrite
    && storedCacheRead === buckets.cacheRead
    && storedOutput === buckets.output
  ) {
    tokens = {
      input: buckets.input,
      output: buckets.output,
      cacheRead: buckets.cacheRead,
      cacheWrite: buckets.cacheWrite,
      inputIncludesCacheWrite: false,
    };
  } else {
    tokens = {
      input: storedInput,
      output: storedOutput,
      cacheRead: storedCacheRead,
      cacheWrite: null,
      inputIncludesCacheWrite: null,
    };
  }

  // A zero is only a confirmed zero on a successful run with a complete
  // token record; failed/cancelled runs default missing usage to 0.
  const zeroIsConfirmed = succeeded && tokensComplete;
  const keep = (value: number | null) => (value === 0 && !zeroIsConfirmed ? null : value);
  const reportedUsd = storedCostUsd === 0 && !(zeroIsConfirmed && estimateSource === "claude_cli_price_table")
    ? null
    : storedCostUsd;

  return {
    provider,
    model: readIdentifier(input.model),
    reportedUsd,
    input: keep(tokens.input),
    output: keep(tokens.output),
    cacheRead: keep(tokens.cacheRead),
    cacheWrite: keep(tokens.cacheWrite),
    inputIncludesCacheWrite: tokens.inputIncludesCacheWrite,
    costScope,
    estimateSource,
    resumed,
    usageSource,
  };
}
