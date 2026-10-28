import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, companies, createDb, heartbeatRuns, issues } from "@paperclipai/db";
import { buildHostServices } from "../services/plugin-host-services.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDatabase = support.supported ? describe : describe.skip;

const SECRET_SESSION = "sess-secret-4f1c";
const SECRET_TEXT = "SECRET-RESULT-TEXT";
const SECRET_MODEL_KEY = "claude-secret-model-key";

describeDatabase("plugin orchestration run usage", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let services: ReturnType<typeof buildHostServices>;
  let companyId: string;
  let otherCompanyId: string;
  let claudeAgentId: string;
  let codexAgentId: string;
  let rootIssueId: string;
  let childIssueId: string;
  let siblingIssueId: string;
  let bulkIssueId: string;
  const runIds = {
    fresh: randomUUID(),
    resumed: randomUUID(),
    failedZero: randomUUID(),
    noUsage: randomUUID(),
    codex: randomUUID(),
    child: randomUUID(),
    sibling: randomUUID(),
    otherCompany: randomUUID(),
  };

  function claudeUsage(overrides: Record<string, unknown> = {}) {
    return {
      inputTokens: 1100,
      cachedInputTokens: 5000,
      outputTokens: 300,
      rawInputTokens: 1100,
      rawCachedInputTokens: 5000,
      rawOutputTokens: 300,
      usageSource: "per_run",
      persistedSessionId: SECRET_SESSION,
      sessionReused: false,
      taskSessionReused: false,
      freshSession: true,
      provider: "anthropic",
      biller: "anthropic",
      model: "claude-opus-5-5",
      costUsd: 0.25,
      costStatus: "reported",
      billingType: "subscription",
      ...overrides,
    };
  }

  function claudeResult(overrides: Record<string, unknown> = {}) {
    return {
      type: "result",
      subtype: "success",
      session_id: SECRET_SESSION,
      result: SECRET_TEXT,
      total_cost_usd: 0.25,
      usage: { input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, output_tokens: 300 },
      modelUsage: {
        [SECRET_MODEL_KEY]: {
          inputTokens: 100,
          outputTokens: 300,
          cacheReadInputTokens: 5000,
          cacheCreationInputTokens: 1000,
          costUSD: 0.25,
        },
      },
      ...overrides,
    };
  }

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-plugin-run-usage-");
    db = createDb(tempDb.connectionString);
    const [company] = await db.insert(companies).values({
      name: "Usage fixture",
      issuePrefix: `RU${randomUUID().slice(0, 6).toUpperCase()}`,
    }).returning();
    const [otherCompany] = await db.insert(companies).values({
      name: "Other usage fixture",
      issuePrefix: `RO${randomUUID().slice(0, 6).toUpperCase()}`,
    }).returning();
    companyId = company!.id;
    otherCompanyId = otherCompany!.id;
    claudeAgentId = randomUUID();
    codexAgentId = randomUUID();
    const otherAgentId = randomUUID();
    await db.insert(agents).values([
      { id: claudeAgentId, companyId, name: "Claude", role: "engineer", status: "idle", adapterType: "claude_local", adapterConfig: {}, runtimeConfig: {}, permissions: {} },
      { id: codexAgentId, companyId, name: "Codex", role: "engineer", status: "idle", adapterType: "codex_local", adapterConfig: {}, runtimeConfig: {}, permissions: {} },
      { id: otherAgentId, companyId: otherCompanyId, name: "Other", role: "engineer", status: "idle", adapterType: "claude_local", adapterConfig: {}, runtimeConfig: {}, permissions: {} },
    ]);
    rootIssueId = randomUUID();
    childIssueId = randomUUID();
    siblingIssueId = randomUUID();
    bulkIssueId = randomUUID();
    await db.insert(issues).values([
      { id: rootIssueId, companyId, title: "Root", status: "todo", priority: "medium" },
      { id: childIssueId, companyId, parentId: rootIssueId, title: "Child", status: "todo", priority: "medium" },
      { id: siblingIssueId, companyId, title: "Sibling", status: "todo", priority: "medium" },
      { id: bulkIssueId, companyId, title: "Bulk", status: "todo", priority: "medium" },
    ]);
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 8, 0, minute));
    await db.insert(heartbeatRuns).values([
      {
        id: runIds.fresh, companyId, agentId: claudeAgentId, status: "succeeded", createdAt: at(1),
        contextSnapshot: { issueId: rootIssueId }, usageJson: claudeUsage(), resultJson: claudeResult(),
        sessionIdAfter: SECRET_SESSION,
      },
      {
        id: runIds.resumed, companyId, agentId: claudeAgentId, status: "succeeded", createdAt: at(2),
        contextSnapshot: { issueId: rootIssueId },
        usageJson: claudeUsage({ sessionReused: true, taskSessionReused: true, freshSession: false, costUsd: 1.5 }),
        resultJson: claudeResult({ total_cost_usd: 1.5 }),
        sessionIdBefore: SECRET_SESSION, sessionIdAfter: SECRET_SESSION,
      },
      {
        id: runIds.failedZero, companyId, agentId: claudeAgentId, status: "failed", createdAt: at(3),
        contextSnapshot: { issueId: rootIssueId },
        usageJson: claudeUsage({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 }),
        resultJson: { type: "result", subtype: "error_during_execution", total_cost_usd: 0, result: SECRET_TEXT },
        error: "Adapter failed",
      },
      {
        id: runIds.noUsage, companyId, agentId: claudeAgentId, status: "running", createdAt: at(4),
        contextSnapshot: { issueId: rootIssueId },
      },
      {
        id: runIds.codex, companyId, agentId: codexAgentId, status: "succeeded", createdAt: at(5),
        contextSnapshot: { issueId: rootIssueId },
        usageJson: { inputTokens: 900, cachedInputTokens: 100, outputTokens: 50, provider: "openai", model: "gpt-5", costUsd: 0.1, freshSession: true, sessionReused: false, taskSessionReused: false },
        resultJson: { type: "result", total_cost_usd: 0.1, modelUsage: { m: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 1, cacheCreationInputTokens: 1 } } },
      },
      {
        id: runIds.child, companyId, agentId: claudeAgentId, status: "succeeded", createdAt: at(6),
        contextSnapshot: { issueId: childIssueId }, usageJson: claudeUsage({ costUsd: 9 }), resultJson: claudeResult({ total_cost_usd: 9 }),
      },
      {
        id: runIds.sibling, companyId, agentId: claudeAgentId, status: "succeeded", createdAt: at(7),
        contextSnapshot: { issueId: siblingIssueId }, usageJson: claudeUsage({ costUsd: 7 }), resultJson: claudeResult({ total_cost_usd: 7 }),
      },
      {
        // Same issue id in another company must never leak in.
        id: runIds.otherCompany, companyId: otherCompanyId, agentId: otherAgentId, status: "succeeded", createdAt: at(8),
        contextSnapshot: { issueId: rootIssueId }, usageJson: claudeUsage({ costUsd: 5 }), resultJson: claudeResult({ total_cost_usd: 5 }),
      },
    ]);
    await db.insert(heartbeatRuns).values(Array.from({ length: 101 }, (_, index) => ({
      companyId,
      agentId: claudeAgentId,
      status: "succeeded",
      createdAt: new Date(Date.UTC(2026, 9, 7, 0, 0, index)),
      contextSnapshot: { issueId: bulkIssueId },
      usageJson: claudeUsage(),
      resultJson: claudeResult(),
    })));
    services = buildHostServices(db, "run-usage-test-plugin", "run-usage-test", {
      forPlugin: () => ({ emit: vi.fn(), subscribe: vi.fn(), clear: vi.fn() }),
    } as never);
  }, 30_000);

  afterAll(async () => {
    services?.dispose();
    await tempDb?.cleanup();
  });

  it("projects allowlisted per-run usage only for the requested issue in the same company", async () => {
    const summary = await services.issues.getOrchestrationSummary({
      companyId,
      issueId: rootIssueId,
      includeSubtree: false,
      includeRunUsage: true,
    });
    expect(summary.runsComplete).toBe(true);
    const ids = summary.runs.map((run) => run.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([runIds.fresh, runIds.resumed, runIds.failedZero, runIds.noUsage, runIds.codex]));
    const byId = new Map(summary.runs.map((run) => [run.id, run]));

    expect(byId.get(runIds.fresh)!.financialUsage).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
      reportedUsd: 0.25,
      input: 100,
      output: 300,
      cacheRead: 5000,
      cacheWrite: 1000,
      inputIncludesCacheWrite: false,
      costScope: "fresh_session",
      estimateSource: "claude_cli_price_table",
      resumed: false,
      usageSource: "per_run",
    });
    expect(byId.get(runIds.resumed)!.financialUsage).toMatchObject({
      reportedUsd: 1.5,
      costScope: "unconfirmed",
      resumed: true,
    });
    expect(byId.get(runIds.failedZero)!.financialUsage).toMatchObject({
      reportedUsd: null,
      input: null,
      output: null,
      cacheRead: null,
      costScope: "unconfirmed",
    });
    expect(byId.get(runIds.noUsage)!.financialUsage).toBeNull();
    expect(byId.get(runIds.codex)!.financialUsage).toMatchObject({
      provider: "openai",
      estimateSource: "unknown",
      cacheWrite: null,
      input: 900,
    });
  });

  it("never returns session ids, result text, model-usage keys or raw usage documents", async () => {
    const summary = await services.issues.getOrchestrationSummary({
      companyId,
      issueId: rootIssueId,
      includeRunUsage: true,
    });
    const serialized = JSON.stringify(summary);
    for (const forbidden of [SECRET_SESSION, SECRET_TEXT, SECRET_MODEL_KEY, "persistedSessionId", "usageJson", "resultJson", "contextSnapshot", "costStatus", "billingType"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("keeps the existing response unchanged when usage was not requested", async () => {
    const summary = await services.issues.getOrchestrationSummary({ companyId, issueId: rootIssueId });
    expect("runsComplete" in summary).toBe(false);
    expect(summary.runs.length).toBe(5);
    for (const run of summary.runs) {
      expect("financialUsage" in run).toBe(false);
      expect(Object.keys(run).sort()).toEqual([
        "agentId", "createdAt", "error", "finishedAt", "id", "invocationSource", "issueId", "startedAt", "status", "triggerDetail",
      ]);
    }
    const subtree = await services.issues.getSubtree({ companyId, issueId: rootIssueId, includeActiveRuns: true });
    const activeRuns = Object.values(subtree.activeRuns ?? {}).flat();
    expect(activeRuns.map((run) => run.id)).toEqual([runIds.noUsage]);
    for (const run of activeRuns) expect("financialUsage" in run).toBe(false);
  });

  it("includes subtree runs only when includeSubtree is requested, each tagged with its issue", async () => {
    const summary = await services.issues.getOrchestrationSummary({
      companyId,
      issueId: rootIssueId,
      includeSubtree: true,
      includeRunUsage: true,
    });
    const child = summary.runs.find((run) => run.id === runIds.child);
    expect(child?.issueId).toBe(childIssueId);
    expect(summary.runs.some((run) => run.id === runIds.sibling || run.id === runIds.otherCompany)).toBe(false);
  });

  it("reports runsComplete=false when the run list is cut at the host limit", async () => {
    const summary = await services.issues.getOrchestrationSummary({
      companyId,
      issueId: bulkIssueId,
      includeRunUsage: true,
    });
    expect(summary.runs).toHaveLength(100);
    expect(summary.runsComplete).toBe(false);
  });

  it("rejects an issue from another company", async () => {
    await expect(services.issues.getOrchestrationSummary({
      companyId: otherCompanyId,
      issueId: rootIssueId,
      includeRunUsage: true,
    })).rejects.toThrow();
  });
});
