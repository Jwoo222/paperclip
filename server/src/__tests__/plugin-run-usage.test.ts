import { describe, expect, it } from "vitest";
import { projectRunFinancialUsage, type RunUsageScalars } from "../services/plugin-run-usage.js";

function freshClaudeRun(overrides: Partial<RunUsageScalars> = {}): RunUsageScalars {
  return {
    status: "succeeded",
    adapterType: "claude_local",
    hasUsageRecord: true,
    hasSessionIdBefore: false,
    provider: "anthropic",
    biller: "anthropic",
    model: "claude-opus-5-5",
    costUsd: 0.4321,
    inputTokens: 1500,
    cachedInputTokens: 20000,
    outputTokens: 800,
    usageSource: "per_run",
    freshSession: true,
    sessionReused: false,
    taskSessionReused: false,
    resultType: "result",
    resultTotalCostUsd: 0.4321,
    modelUsage: [
      { inputTokens: 300, outputTokens: 700, cacheReadInputTokens: 18000, cacheCreationInputTokens: 1000 },
      { inputTokens: 100, outputTokens: 100, cacheReadInputTokens: 2000, cacheCreationInputTokens: 100 },
    ],
    ...overrides,
  };
}

describe("projectRunFinancialUsage", () => {
  it("projects a verified fresh Claude CLI run with split cache buckets", () => {
    expect(projectRunFinancialUsage(freshClaudeRun())).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      reportedUsd: 0.4321,
      input: 400,
      output: 800,
      cacheRead: 20000,
      cacheWrite: 1100,
      inputIncludesCacheWrite: false,
      costScope: "fresh_session",
      estimateSource: "claude_cli_price_table",
      resumed: false,
      usageSource: "per_run",
    });
  });

  it("keeps a confirmed zero only on a successful, complete, verified run", () => {
    const usage = projectRunFinancialUsage(freshClaudeRun({
      costUsd: 0,
      resultTotalCostUsd: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      modelUsage: [{ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }],
    }));
    expect(usage).toMatchObject({ reportedUsd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("does not promote zeros from failed, cancelled or crashed runs", () => {
    for (const status of ["failed", "cancelled", "timed_out"]) {
      const usage = projectRunFinancialUsage(freshClaudeRun({
        status,
        costUsd: 0,
        resultTotalCostUsd: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        modelUsage: null,
      }));
      expect(usage).toMatchObject({
        reportedUsd: null,
        input: null,
        output: null,
        cacheRead: null,
        cacheWrite: null,
        costScope: "unconfirmed",
      });
    }
  });

  it("keeps real spend on a failed run but leaves its scope unconfirmed", () => {
    const usage = projectRunFinancialUsage(freshClaudeRun({ status: "failed" }));
    expect(usage).toMatchObject({ reportedUsd: 0.4321, costScope: "unconfirmed" });
  });

  it("returns null when the run stored no usage record", () => {
    expect(projectRunFinancialUsage(freshClaudeRun({ hasUsageRecord: false }))).toBeNull();
  });

  it("returns null fields instead of 0 when values are missing", () => {
    const usage = projectRunFinancialUsage(freshClaudeRun({
      costUsd: undefined,
      inputTokens: undefined,
      cachedInputTokens: undefined,
      outputTokens: undefined,
      resultTotalCostUsd: undefined,
      modelUsage: null,
    }));
    expect(usage).toMatchObject({
      reportedUsd: null,
      input: null,
      output: null,
      cacheRead: null,
      cacheWrite: null,
      inputIncludesCacheWrite: null,
      estimateSource: "unknown",
    });
    // Zero tokens with an incomplete record are not confirmed zeros.
    expect(projectRunFinancialUsage(freshClaudeRun({ inputTokens: 0, outputTokens: undefined, modelUsage: null })))
      .toMatchObject({ input: null, output: null });
  });

  it("rejects negative, NaN, infinite, fractional-token and string values", () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "12", true, { n: 1 }]) {
      const usage = projectRunFinancialUsage(freshClaudeRun({
        costUsd: bad,
        resultTotalCostUsd: bad,
        inputTokens: bad,
        cachedInputTokens: bad,
        outputTokens: bad,
        modelUsage: null,
      }));
      expect(usage).toMatchObject({
        reportedUsd: null,
        input: null,
        output: null,
        cacheRead: null,
        estimateSource: "unknown",
      });
    }
    expect(projectRunFinancialUsage(freshClaudeRun({ inputTokens: 10.5, modelUsage: null }))?.input).toBeNull();
  });

  it("refuses to split cache buckets when modelUsage is malformed or inconsistent", () => {
    const malformed = projectRunFinancialUsage(freshClaudeRun({
      modelUsage: [{ inputTokens: 300, outputTokens: "700", cacheReadInputTokens: 18000, cacheCreationInputTokens: 1000 }],
    }));
    expect(malformed).toMatchObject({ input: 1500, cacheWrite: null, inputIncludesCacheWrite: null });
    const inconsistent = projectRunFinancialUsage(freshClaudeRun({
      modelUsage: [{ inputTokens: 999, outputTokens: 800, cacheReadInputTokens: 20000, cacheCreationInputTokens: 1 }],
    }));
    expect(inconsistent).toMatchObject({ input: 1500, cacheWrite: null, inputIncludesCacheWrite: null });
  });

  it("marks resumed or previous-session runs unconfirmed while keeping the reference amount", () => {
    const cases: Array<Partial<RunUsageScalars>> = [
      { hasSessionIdBefore: true },
      { sessionReused: true, freshSession: false },
      { taskSessionReused: true },
      { freshSession: false },
      { usageSource: "session_delta" },
    ];
    for (const overrides of cases) {
      const usage = projectRunFinancialUsage(freshClaudeRun(overrides));
      expect(usage?.costScope).toBe("unconfirmed");
      expect(usage?.reportedUsd).toBe(0.4321);
    }
    expect(projectRunFinancialUsage(freshClaudeRun({ hasSessionIdBefore: true }))?.resumed).toBe(true);
  });

  it("treats missing session evidence on historical rows as unknown", () => {
    const usage = projectRunFinancialUsage(freshClaudeRun({
      freshSession: undefined,
      sessionReused: undefined,
      taskSessionReused: undefined,
    }));
    expect(usage).toMatchObject({ resumed: null, costScope: "unconfirmed" });
  });

  it("does not let a per_run token label stand in for a confirmed USD scope", () => {
    const usage = projectRunFinancialUsage(freshClaudeRun({ taskSessionReused: undefined, usageSource: "per_run" }));
    expect(usage).toMatchObject({ usageSource: "per_run", costScope: "unconfirmed" });
  });

  it("keeps non-Claude adapters and unknown models at estimateSource unknown", () => {
    expect(projectRunFinancialUsage(freshClaudeRun({ adapterType: "codex_local", provider: "openai" })))
      .toMatchObject({ estimateSource: "unknown", provider: "openai", cacheWrite: null });
    // provider=anthropic alone does not promote another adapter's amount.
    expect(projectRunFinancialUsage(freshClaudeRun({ adapterType: "acpx" })))
      .toMatchObject({ estimateSource: "unknown", cacheWrite: null, inputIncludesCacheWrite: null });
    expect(projectRunFinancialUsage(freshClaudeRun({ biller: "aws_bedrock" }))?.estimateSource).toBe("unknown");
    expect(projectRunFinancialUsage(freshClaudeRun({ resultTotalCostUsd: 0.5 }))?.estimateSource).toBe("unknown");
    expect(projectRunFinancialUsage(freshClaudeRun({ resultType: "assistant" }))?.estimateSource).toBe("unknown");
    expect(projectRunFinancialUsage(freshClaudeRun({ model: "unknown", provider: "unknown" })))
      .toMatchObject({ model: null, provider: null, estimateSource: "unknown" });
    expect(projectRunFinancialUsage(freshClaudeRun({ model: "x".repeat(101) }))?.model).toBeNull();
    expect(projectRunFinancialUsage(freshClaudeRun({ model: "bad model\nname" }))?.model).toBeNull();
  });

  it("only accepts the fixed usageSource enum", () => {
    expect(projectRunFinancialUsage(freshClaudeRun({ usageSource: "something_else" }))?.usageSource).toBeNull();
  });
});
