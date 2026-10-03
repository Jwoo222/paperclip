import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execute } from "../src/server/execute.js";
import { readHermesRunUsage } from "../src/server/run-usage.js";
import { productionUsagePayload } from "./heartbeat-usage-payload.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function root() {
  const base = process.env.PAPERCLIP_RUN_SCRATCH_DIR || process.env.PAPERCLIP_SCRATCH_DIR || process.env.TMPDIR || os.tmpdir();
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, "hermes-run-usage-test-"));
  roots.push(dir);
  return dir;
}
const expected = { runId: "run-1", requestedSessionId: "previous-session", finalSessionId: "rotated-session", exitCode: 0, timedOut: false };
function report() {
  return { version: 1, runId: "run-1", requestedSessionId: "previous-session", finalSessionId: "rotated-session", exitCode: 0, complete: true,
    calls: [
      { callIndex: 1, sessionId: "previous-session", usage: { inputTokens: 100, outputTokens: 3, cachedInputTokens: 80 } },
      { callIndex: 2, sessionId: "rotated-session", usage: { inputTokens: 200, outputTokens: 5, cachedInputTokens: 150 } },
    ] };
}
async function readReport(body: any, options = expected) {
  const file = path.join(await root(), "usage.json");
  await writeFile(file, typeof body === "string" ? body : JSON.stringify(body));
  return readHermesRunUsage(file, options);
}

describe("run-bound Hermes usage transport", () => {
  it("sums inclusive input/cache/output across a session rotation", async () => {
    expect(await readReport(report())).toEqual({ inputTokens: 300, outputTokens: 8, cachedInputTokens: 230 });
  });
  it.each([
    ["foreign run", (r: any) => r.runId = "another-run"],
    ["foreign requested session", (r: any) => r.requestedSessionId = "another-session"],
    ["wrong final session", (r: any) => r.finalSessionId = "another-session"],
    ["partial run", (r: any) => r.complete = false],
    ["failed run", (r: any) => r.exitCode = 1],
    ["unknown version", (r: any) => r.version = 2],
    ["no calls", (r: any) => r.calls = []],
    ["missing call usage", (r: any) => r.calls[1].usage = null],
    ["negative count", (r: any) => r.calls[1].usage.inputTokens = -1],
    ["fractional count", (r: any) => r.calls[1].usage.outputTokens = 1.5],
    ["string count", (r: any) => r.calls[1].usage.outputTokens = "8"],
    ["boolean count", (r: any) => r.calls[1].usage.outputTokens = true],
    ["cache exceeds input", (r: any) => r.calls[1].usage.cachedInputTokens = 201],
    ["counter overflow", (r: any) => r.calls[1].usage.inputTokens = Number.MAX_SAFE_INTEGER],
    ["duplicate call", (r: any) => r.calls[1].callIndex = 1],
    ["raw payload forbidden", (r: any) => r.calls[1].prompt = "must-not-leave-Hermes"],
    ["extra report fields", (r: any) => r.environment = {}],
  ])("rejects %s without inventing zero usage", async (_name, mutate) => {
    const r = report(); mutate(r);
    expect(await readReport(r)).toBeUndefined();
  });
  it("accepts measured zero counts but not no-usage", async () => {
    const r = report(); r.calls = [{ callIndex: 1, sessionId: "rotated-session", usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } }];
    expect(await readReport(r)).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
  });
  it("rejects timeout even when a valid report was already written", async () => {
    expect(await readReport(report(), { ...expected, timedOut: true })).toBeUndefined();
  });
  it("rejects process failure even when the report claims success", async () => {
    expect(await readReport(report(), { ...expected, exitCode: 1 })).toBeUndefined();
  });
  it("treats missing, malformed, and oversized reports as absent", async () => {
    expect(await readHermesRunUsage(path.join(await root(), "absent.json"), expected)).toBeUndefined();
    expect(await readReport("{partial")).toBeUndefined();
    expect(await readReport(" ".repeat(2 * 1024 * 1024 + 1))).toBeUndefined();
  });
  it("treats a directory instead of a report as absent", async () => {
    expect(await readHermesRunUsage(await root(), expected)).toBeUndefined();
  });
});

// Explicit opt-in: exercises the staged Hermes code in a real Python subprocess.
// Provider responses are synthetic, not paid model measurements.
const native = process.env.HERMES_USAGE_TEST_PYTHON && process.env.HERMES_USAGE_TEST_FIXTURE;
describe.skipIf(!native)("staged Hermes quiet/accounting -> actual adapter execution", () => {
  async function run(mode: string) {
    const dir = await root();
    if (mode === "setup-failure") await writeFile(path.join(dir, "not-a-directory"), "accounting setup must not stop execution");
    await writeFile(path.join(dir, "chat"), `import os, runpy, sys\nassert '-Q' in sys.argv and '--query-file' in sys.argv\nassert '--usage-file' not in sys.argv\nwith open(sys.argv[sys.argv.index('--query-file') + 1], encoding='utf-8') as f:\n    assert 'PRIVATE_QUERY_SENTINEL' in f.read()\nrunpy.run_path(os.environ['HERMES_USAGE_TEST_FIXTURE'], run_name='__main__')\n`);
    const logs: string[] = [];
    const result = await execute({
      runId: "run-1", agent: { id: "test", companyId: "test", name: "Hermes", adapterType: "hermes_local", adapterConfig: {} },
      runtime: { sessionParams: { sessionId: "previous-session" }, sessionId: null, sessionDisplayId: null, taskKey: null },
      config: { hermesCommand: process.env.HERMES_USAGE_TEST_PYTHON, cwd: dir, provider: "openai-codex", model: "offline-fixture",
        timeoutSec: mode === "timeout" ? 2 : 20, graceSec: 1, promptTemplate: "PRIVATE_QUERY_SENTINEL",
        extraArgs: ["--fixture-mode", mode], env: { HERMES_HOME: path.join(dir, "home"), PYTHONDONTWRITEBYTECODE: "1",
          ...(mode === "setup-failure" ? { PAPERCLIP_RUN_SCRATCH_DIR: path.join(dir, "not-a-directory") } : {}) } },
      context: {}, onLog: async (_stream: string, text: string) => { logs.push(text); }, onMeta: async () => {},
    } as any);
    expect(JSON.stringify(result.resultJson)).not.toContain("PRIVATE_QUERY_SENTINEL");
    expect(logs.join("")).not.toContain("PRIVATE_QUERY_SENTINEL");
    expect(logs.join("")).not.toContain("HERMES_PAPERCLIP_USAGE");
    return { dir, result };
  }
  it.each(["success", "rotation"])("%s: ignores historical counters and matches actual candidate per-call logs", async (mode) => {
    const { dir, result } = await run(mode);
    expect(result.exitCode).toBe(0);
    const calls = JSON.parse(await readFile(path.join(dir, "call-log.json"), "utf8"));
    const sum = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    for (const call of calls) {
      const counts = call.line.match(/ in=(\d+) out=(\d+)/);
      sum.inputTokens += Number(counts[1]); sum.outputTokens += Number(counts[2]);
      sum.cachedInputTokens += Number(call.line.match(/ cache=(\d+)\//)?.[1] || 0);
    }
    expect(calls).toHaveLength(2);
    expect(result.usage).toEqual(sum);
    expect(result.usageBasis).toBe("per_run");
    expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 8, cachedInputTokens: 230 });
    expect((result.resultJson as any).usage).toEqual(sum);
    const usageJson = await productionUsagePayload(result);
    expect(usageJson).toMatchObject({ ...sum, usageSource: "per_run" });
    expect((result.resultJson as any).result).toContain("Tokens: 999999 input 777777 output");
    expect(result.sessionParams).toEqual({ sessionId: mode === "rotation" ? "rotated-session" : "previous-session" });
    const produced = JSON.parse(await readFile(path.join(dir, "produced-report.json"), "utf8"));
    expect(produced.calls).toHaveLength(2);
    expect(produced.calls[0].sessionId).toBe("previous-session");
    expect(produced.calls[1].sessionId).toBe(mode === "rotation" ? "rotated-session" : "previous-session");
    expect(JSON.stringify(produced)).not.toMatch(/PRIVATE_QUERY|prompt|environment|authorization/i);
    console.log(JSON.stringify({ mode, usageJson, actualCandidateCalls: calls, session: result.sessionParams }));
  });
  it.each(["failure", "no-usage", "write-failure", "setup-failure", "timeout"])("%s: null usage without changing outcome/session/reply", async (mode) => {
    const { result } = await run(mode);
    expect(result.usage).toBeUndefined();
    expect(result.costUsd).toBeUndefined();
    expect((result.resultJson as any).usage).toBeNull();
    expect(await productionUsagePayload(result)).toBeNull();
    if (mode === "timeout") expect(result.timedOut).toBe(true);
    else {
      expect(result.exitCode).toBe(mode === "failure" ? 1 : 0);
      expect(result.sessionParams).toEqual({ sessionId: "previous-session" });
      expect((result.resultJson as any).result).toMatch(/응답 보존\r?\n    들여쓰기/);
    }
    console.log(JSON.stringify({ mode, usageJson: (result.resultJson as any).usage, exitCode: result.exitCode, timedOut: result.timedOut }));
  });
});
