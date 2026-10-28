import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, authUsers, companies, companyMemberships, createDb, heartbeatRunEvents, issues } from "@paperclipai/db";
import type { ServerAdapterModule } from "../adapters/index.js";
import { registerServerAdapter, unregisterServerAdapter } from "../adapters/index.js";
import { heartbeatService } from "../services/heartbeat.js";
import { applyIssueExecutionPolicyTransition, normalizeIssueExecutionPolicy } from "../services/issue-execution-policy.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { drainHeartbeatRunsToQuiescence } from "./helpers/drain-heartbeat-runs.js";

const support = await getEmbeddedPostgresTestSupport();
const describeDb = support.supported ? describe : describe.skip;
if (!support.supported) console.warn(`Override integration unavailable: ${support.reason}`);

// Real database, execution-policy transitions and heartbeat dispatch; only the
// provider boundary is replaced, so tests never spend tokens or mutate live data.
describeDb("heartbeat issue model overrides across assignment paths", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let heartbeat: ReturnType<typeof heartbeatService>;
  const execute = vi.fn<ServerAdapterModule["execute"]>(async ({ agent, config }) => {
    const model = config.model as string;
    if (agent.adapterType === "claude_local" && !model.startsWith("claude-")) {
      throw new Error("Cross-family model reached Claude adapter");
    }
    return { exitCode: 0, signal: null, timedOut: false, model, summary: "Verified adapter dispatch." };
  });

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("heartbeat-model-overrides-");
    db = createDb(tempDb.connectionString);
    heartbeat = heartbeatService(db);
    // Upstream now requires the responsible user to exist with an active membership.
    await db.insert(authUsers).values({ id: "responsible-user", name: "Fixture owner", email: "owner@example.test", createdAt: new Date(), updatedAt: new Date() });
    for (const type of ["hermes_local", "codex_local", "claude_local"]) {
      registerServerAdapter({ type, supportsLocalAgentJwt: false, execute,
        testEnvironment: async () => ({ adapterType: type, status: "pass", checks: [], testedAt: new Date(0).toISOString() }),
      });
    }
  }, 90_000);

  afterAll(async () => {
    if (db && heartbeat) await drainHeartbeatRunsToQuiescence(db, heartbeat);
    for (const type of ["hermes_local", "codex_local", "claude_local"]) unregisterServerAdapter(type);
    await tempDb?.cleanup();
  });

  async function seed(modelConfig: Record<string, unknown> = { model: "gpt-6-luna" }) {
    const companyId = randomUUID();
    const coder = randomUUID();
    const reviewer = randomUUID();
    const issueId = randomUUID();
    const prefix = `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    await db.insert(companies).values({ id: companyId, name: "Override integration", issuePrefix: prefix,
      requireBoardApprovalForNewAgents: false, defaultResponsibleUserId: "responsible-user" });
    await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: "responsible-user", status: "active", membershipRole: "member" });
    await db.insert(agents).values([
      { id: coder, companyId, name: "GPT executor", role: "engineer", status: "idle", adapterType: "hermes_local",
        adapterConfig: { model: "gpt-6-astra" }, runtimeConfig: {}, permissions: {} },
      { id: reviewer, companyId, name: "Claude reviewer", role: "engineer", status: "idle", adapterType: "claude_local",
        adapterConfig: { model: "claude-opus-5-5" }, runtimeConfig: {}, permissions: {} },
    ]);
    const policy = normalizeIssueExecutionPolicy({ stages: [{ type: "review", participants: [{ type: "agent", agentId: reviewer }] }] })!;
    await db.insert(issues).values({ id: issueId, companyId, title: "Model override regression", status: "in_progress",
      assigneeAgentId: coder, issueNumber: 1, identifier: `${prefix}-1`, executionPolicy: policy,
      assigneeAdapterOverrides: { adapterConfig: modelConfig }, responsibleUserId: "responsible-user" });
    return { coder, reviewer, issueId, policy };
  }

  async function run(agentId: string, issueId: string, reason: string, expectedModel: string) {
    const queued = await heartbeat.wakeup(agentId, { source: "automation", triggerDetail: "system", reason,
      payload: { issueId }, contextSnapshot: { issueId, taskId: issueId, wakeReason: reason },
      requestedByActorType: "user", requestedByActorId: "local-board" });
    expect(queued).not.toBeNull();
    await drainHeartbeatRunsToQuiescence(db, heartbeat);
    const finished = await heartbeat.getRun(queued!.id);
    expect(finished).toMatchObject({ status: "succeeded", exitCode: 0 });
    const call = execute.mock.calls.find(([ctx]) => ctx.runId === queued!.id);
    expect(call?.[0].config.model).toBe(expectedModel);
    const events = await db.select().from(heartbeatRunEvents).where(eq(heartbeatRunEvents.runId, queued!.id));
    return events.filter((event) => event.eventType === "issue_adapter_override_skipped");
  }

  it("routes GPT executor to Claude policy reviewer and restores designation on changes requested", async () => {
    const { coder, reviewer, issueId, policy } = await seed();
    expect(await run(coder, issueId, "issue_assigned", "gpt-6-luna")).toHaveLength(0);
    const [initial] = await db.select().from(issues).where(eq(issues.id, issueId));
    const review = applyIssueExecutionPolicyTransition({ issue: initial, policy, requestedStatus: "done",
      requestedAssigneePatch: {}, actor: { agentId: coder }, commentBody: "Ready for review" });
    await db.update(issues).set(review.patch).where(eq(issues.id, issueId));
    expect(review.patch.assigneeAgentId).toBe(reviewer);
    const skipped = await run(reviewer, issueId, "execution_review_requested", "claude-opus-5-5");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ level: "warn", payload: { reason: "model_family_mismatch" } });
    expect(skipped[0].message).toContain("using agent configuration");
    // Recovery of that same reviewer also goes through the dispatch gate.
    expect(await run(reviewer, issueId, "execution_review_participant_recovery", "claude-opus-5-5")).toHaveLength(1);
    const [pending] = await db.select().from(issues).where(eq(issues.id, issueId));
    const changes = applyIssueExecutionPolicyTransition({ issue: pending, policy, requestedStatus: "in_progress",
      requestedAssigneePatch: {}, actor: { agentId: reviewer }, commentBody: "Please fix the edge case" });
    await db.update(issues).set(changes.patch).where(eq(issues.id, issueId));
    expect(changes.patch.assigneeAgentId).toBe(coder);
    expect(await run(coder, issueId, "execution_changes_requested", "gpt-6-luna")).toHaveLength(0);
    const [returned] = await db.select().from(issues).where(eq(issues.id, issueId));
    expect(returned.assigneeAdapterOverrides).toEqual({ adapterConfig: { model: "gpt-6-luna" } });
  }, 90_000);

  it.each(["issue_assigned", "issue_recovery_action_restored"])("guards direct/fallback reassignment (%s)", async (reason) => {
    const { reviewer, issueId } = await seed();
    await db.update(issues).set({ assigneeAgentId: reviewer, executionPolicy: null }).where(eq(issues.id, issueId));
    expect(await run(reviewer, issueId, reason, "claude-opus-5-5")).toHaveLength(1);
  }, 90_000);

  it("ignores the old cross-family designation when a closed task is reopened", async () => {
    const { coder, issueId } = await seed({ model: "claude-opus-4-6" });
    await db.update(issues).set({ status: "done", executionPolicy: null }).where(eq(issues.id, issueId));
    await db.update(issues).set({ status: "in_progress" }).where(eq(issues.id, issueId));
    expect(await run(coder, issueId, "issue_assigned", "gpt-6-astra")).toHaveLength(1);
  }, 90_000);

  it("ignores a retired profile on reopening a cancelled task", async () => {
    const { coder, issueId } = await seed({ modelProfile: "cheap" });
    await db.update(issues).set({ status: "cancelled", executionPolicy: null }).where(eq(issues.id, issueId));
    await db.update(issues).set({ status: "in_progress" }).where(eq(issues.id, issueId));
    const skipped = await run(coder, issueId, "issue_assigned", "gpt-6-astra");
    expect(skipped[0].payload).toMatchObject({ reason: "obsolete_model_profile" });
    const call = execute.mock.calls.at(-1)![0];
    expect(call.config).not.toHaveProperty("modelProfile");
  }, 90_000);
});
