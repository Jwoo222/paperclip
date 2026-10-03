import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

/** Execute the exact current production token/session/usageJson serialization
 * fragments without loading the enormous service or connecting to its DB.
 * Metadata helpers are stubbed; token normalization/selection/payload are NOT.
 * These are isolated persistence-payload tests, not writes to the operational DB.
 */
export async function productionUsagePayload(adapterResult: any) {
  const source = await readFile(new URL("../../../../server/src/services/heartbeat.ts", import.meta.url), "utf8");
  function section(start: string, end: string) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error("Production usage contract moved; update this explicit harness");
    return source.slice(from, to);
  }
  const normalize = section("function normalizeUsageTotals(", "function readRawUsageTotals(");
  const perRun = section("async function resolveNormalizedUsageForSession(", "async function evaluateSessionCompaction(");
  const payload = section("const usageJson =\n          normalizedUsage", "const persistedResultJson =");
  const js = stripTypeScriptTypes(`
    function factory() {
    ${normalize}
    ${perRun}
    async function serialize(adapterResult) {
      const rawUsage = normalizeUsageTotals(adapterResult.usage);
      const sessionUsageResolution = await resolveNormalizedUsageForSession({
        agentId: 'test', runId: 'run-1', sessionId: 'previous-session', rawUsage, usageBasis: adapterResult.usageBasis,
      });
      const normalizedUsage = sessionUsageResolution.normalizedUsage;
      const cacheAdjustedCostUsd = null;
      const nextSessionState = { displayId: adapterResult.sessionParams?.sessionId || null, legacySessionId: null };
      const runtimeForAdapter = { sessionId: 'previous-session', sessionDisplayId: null };
      const taskSessionForRun = {};
      const sessionCompaction = { rotate: false, reason: null };
      const configFreshnessResultMetadata = null;
      ${payload}
      return usageJson;
    }
    return serialize;
    }
  `, { mode: "strip" });
  const cannotUseSessionHistory = () => { throw new Error("Per-run or absent usage must not consult previous totals"); };
  const build = new Function("asNumber", "getLatestRunForSession", "readRawUsageTotals", "deriveNormalizedUsageDelta",
    "readNonEmptyString", "resolveLedgerBiller", "resolveLedgerCostStatus", "normalizeLedgerBillingType", js + "\nreturn factory();")(
    (n: unknown, fallback: number) => typeof n === "number" ? n : fallback,
    cannotUseSessionHistory, cannotUseSessionHistory, cannotUseSessionHistory,
    (s: unknown) => typeof s === "string" && s.length ? s : null,
    () => "unknown", () => "unknown", () => "unknown",
  );
  return JSON.parse(JSON.stringify(await build(adapterResult)));
}
