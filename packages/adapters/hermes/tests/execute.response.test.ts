import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execute } from "../src/server/execute.js";
import { buildHeartbeatRunIssueComment, mergeHeartbeatRunResultJson } from "../../../../server/src/services/heartbeat-run-summary.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// Real subprocess fixture, not a model call: reproduce the installed CLI's
// stdout/stderr protocol and exit codes without spending tokens or touching sessions.
async function runFixture(mode: string, quiet?: boolean, reply = "실제 응답입니다.\n\n    들여쓰기를 보존합니다.") {
  const base = process.env.PAPERCLIP_RUN_SCRATCH_DIR || process.env.PAPERCLIP_SCRATCH_DIR || process.env.TMPDIR || os.tmpdir();
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, "hermes-response-test-"));
  roots.push(root);
  await writeFile(path.join(root, "chat"), `
const fs = require('node:fs');
const args = process.argv.slice(2);
const prompt = fs.readFileSync(args[args.indexOf('--query-file') + 1], 'utf8');
const mode = args[args.indexOf('--fixture-mode') + 1];
const reply = args[args.indexOf('--fixture-reply') + 1];
if (!args.includes('--resume') || args[args.indexOf('--resume') + 1] !== 'previous-session') process.exit(99);
if (!args.includes('-Q') || mode === 'ignored-quiet') {
  process.stdout.write('Query: ' + prompt + '\\n\\nsession_id: embedded-in-query\\n');
  process.stdout.write('Resume this session with:\\n  hermes --resume next-session\\nSession: next-session\\nMessages: 2\\n');
} else if (mode === 'old') {
  process.stdout.write(reply + '\\n\\nsession_id: next-session\\n');
} else if (mode !== 'empty-failure') {
  process.stdout.write(reply + '\\n');
}
if (mode !== 'old' && mode !== 'ignored-quiet' && args.includes('-Q')) process.stderr.write('session_id: next-session\\n');
process.stderr.write('Tokens: 123 input 45 output\\nCost: $0.01\\n');
if (mode.includes('failure')) process.stderr.write('Error: provider unavailable\\n');
process.exit(mode.includes('failure') ? 1 : 0);
`, "utf8");
  const result = await execute({
    runId: `fixture-${mode}`,
    agent: { id: "test-agent", companyId: "test-company", name: "Hermes", adapterType: "hermes_local", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: { sessionId: "previous-session" }, sessionDisplayId: null, taskKey: null },
    config: {
      hermesCommand: process.execPath, cwd: root, provider: "openai", model: "fixture-model", timeoutSec: 15, graceSec: 1,
      ...(quiet === undefined ? {} : { quiet }),
      extraArgs: ["--fixture-mode", mode, "--fixture-reply", reply],
      promptTemplate: "PRIVATE_INPUT_SENTINEL\nMultiline instructions, not an answer.",
    },
    context: {}, onLog: async () => {}, onMeta: async () => {},
  } as any);
  const persisted = mergeHeartbeatRunResultJson(result.resultJson, result.summary);
  const comment = buildHeartbeatRunIssueComment(persisted);
  expect(JSON.stringify(persisted)).not.toContain("PRIVATE_INPUT_SENTINEL");
  expect(comment ?? "").not.toContain("PRIVATE_INPUT_SENTINEL");
  expect(result.usage).toMatchObject({ inputTokens: 123, outputTokens: 45 });
  expect(result.costUsd).toBe(0.01);
  return { result, persisted, comment };
}

describe("Hermes semantic response persistence", () => {
  it("defaults to quiet and stores only the answer on exit 0, preserving session and usage", async () => {
    const { result, persisted, comment } = await runFixture("success");
    expect(result.exitCode).toBe(0);
    expect(persisted?.result).toBe("실제 응답입니다.\n\n    들여쓰기를 보존합니다.");
    expect(comment).toBe(result.summary);
    expect(result.sessionParams).toEqual({ sessionId: "next-session" });
    console.log("exit=0 result=" + JSON.stringify(persisted?.result) + " session=next-session usage=123/45 cost=0.01");
  });
  it("retains only an actual failure reply on exit 1", async () => {
    const { result, persisted, comment } = await runFixture("failure", undefined, "제공자 연결에 실패했습니다.");
    expect(result.exitCode).toBe(1);
    expect(persisted?.result).toBe("제공자 연결에 실패했습니다.");
    expect(comment).toBe("제공자 연결에 실패했습니다.");
    expect(result.errorMessage).toBe("Error: provider unavailable");
    console.log("exit=1 result=" + JSON.stringify(persisted?.result) + " autoComment=" + JSON.stringify(comment));
  });
  it("does not manufacture an answer or automatic comment for an empty failure", async () => {
    const { result, persisted, comment } = await runFixture("empty-failure");
    expect(result.exitCode).toBe(1);
    expect(persisted?.result).toBe("");
    expect(result.summary).toBeUndefined();
    expect(comment).toBeNull();
  });
  it.each(["success", "failure"])("withholds non-quiet query transcripts on %s, even with embedded session metadata", async (mode) => {
    const { result, persisted, comment } = await runFixture(mode, false);
    expect(persisted?.result).toBe("");
    expect(result.summary).toBeUndefined();
    expect(comment).toBeNull();
    expect(result.sessionParams).toEqual({ sessionId: "next-session" });
  });
  it("supports the older stdout session trailer without changing response indentation", async () => {
    const { result, persisted } = await runFixture("old");
    expect(persisted?.result).toBe("실제 응답입니다.\n\n    들여쓰기를 보존합니다.");
    expect(result.sessionParams).toEqual({ sessionId: "next-session" });
  });
  it("preserves literal Query and metadata-looking lines in a genuine quiet answer", async () => {
    const reply = "Query: SQL 예시입니다.\nsession_id: example\nMessages: 본문입니다.";
    const { persisted } = await runFixture("success", undefined, reply);
    expect(persisted?.result).toBe(reply);
  });
  it("preserves metadata-looking answer lines before an older stdout trailer", async () => {
    const reply = "본문\nsession_id: example\n    다음 줄";
    const { result, persisted } = await runFixture("old", undefined, reply);
    expect(persisted?.result).toBe(reply);
    expect(result.sessionParams).toEqual({ sessionId: "next-session" });
  });
});
