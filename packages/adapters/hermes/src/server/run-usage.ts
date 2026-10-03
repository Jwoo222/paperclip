import { lstat, readFile } from "node:fs/promises";
import type { UsageSummary } from "@paperclipai/adapter-utils";

export const HERMES_USAGE_FILE_ENV = "HERMES_PAPERCLIP_USAGE_FILE";
export const HERMES_USAGE_RUN_ENV = "HERMES_PAPERCLIP_USAGE_RUN_ID";
export const HERMES_USAGE_SESSION_ENV = "HERMES_PAPERCLIP_USAGE_REQUESTED_SESSION";
const MAX_BYTES = 2 * 1024 * 1024;

const token = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const session = (s: unknown): s is string | null => s === null || (typeof s === "string" && s.length > 0 && s.length <= 1024);
const keys = (obj: Record<string, unknown>, expected: string[]) =>
  Object.keys(obj).length === expected.length && expected.every((k) => Object.prototype.hasOwnProperty.call(obj, k));

/** Read only a fresh, run-bound, complete report. Never infer tokens from replies. */
export async function readHermesRunUsage(
  file: string | undefined,
  expected: { runId: string | undefined; requestedSessionId: string | null; finalSessionId: string | null; exitCode: number | null; timedOut: boolean },
): Promise<UsageSummary | undefined> {
  if (!file || !expected.runId || expected.exitCode !== 0 || expected.timedOut) return undefined;
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.size > MAX_BYTES) return undefined;
    const data = JSON.parse(await readFile(file, "utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data)
      || !keys(data, ["version", "runId", "requestedSessionId", "finalSessionId", "exitCode", "complete", "calls"])
      || data.version !== 1 || data.runId !== expected.runId || data.exitCode !== 0 || data.complete !== true
      || data.requestedSessionId !== expected.requestedSessionId || data.finalSessionId !== expected.finalSessionId
      || !session(data.requestedSessionId) || !session(data.finalSessionId)
      || !Array.isArray(data.calls) || data.calls.length < 1 || data.calls.length > 10000) return undefined;
    const sum = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    for (const [index, call] of data.calls.entries()) {
      if (!call || typeof call !== "object" || Array.isArray(call)
        || !keys(call, ["callIndex", "sessionId", "usage"]) || call.callIndex !== index + 1 || !session(call.sessionId)
        || !call.usage || typeof call.usage !== "object" || Array.isArray(call.usage)
        || !keys(call.usage, ["inputTokens", "outputTokens", "cachedInputTokens"])) return undefined;
      const u = call.usage;
      if (!token(u.inputTokens) || !token(u.outputTokens) || !token(u.cachedInputTokens) || u.cachedInputTokens > u.inputTokens) return undefined;
      sum.inputTokens += u.inputTokens;
      sum.outputTokens += u.outputTokens;
      sum.cachedInputTokens += u.cachedInputTokens;
      if (!Object.values(sum).every(token)) return undefined;
    }
    return sum;
  } catch {
    // Missing/old Hermes, malformed/partial reports, and I/O failures are not run failures.
    return undefined;
  }
}
