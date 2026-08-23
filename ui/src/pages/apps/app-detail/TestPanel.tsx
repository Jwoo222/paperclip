import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  Loader2,
  Play,
  Search,
  ShieldQuestion,
} from "lucide-react";
import type {
  ToolCatalogEntry,
  ToolConnectionAccessSummary,
  ToolConnectionTestAgent,
  ToolConnectionTestCallResult,
  ToolConnectionTestCallStatus,
  ToolConnectionTestDecision,
} from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { toolsApi } from "@/api/tools";
import { queryKeys } from "@/lib/queryKeys";
import { useCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  JsonSchemaForm,
  getDefaultValues,
  validateJsonSchemaForm,
  type JsonSchemaNode,
} from "@/components/JsonSchemaForm";
import { cn, relativeTime } from "@/lib/utils";
import { appTabHref } from "../app-tabs";
import { t } from "@/i18n";

// ---------------------------------------------------------------------------
// Small format helpers
// ---------------------------------------------------------------------------

/** "1.2s" / "0.4s" — the copy-spec always shows seconds with one decimal. */
function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** relativeTime() returns "just now"; the spec capitalizes it ("Just now"). */
function relTime(date: Date): string {
  const t = relativeTime(date);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Sub-line copy: first sentence of the catalog description, no trailing period. */
function actionSubLine(entry: ToolCatalogEntry): string | null {
  if (!entry.description) return null;
  const firstSentence = entry.description.split(/(?<=\.)\s/)[0] ?? entry.description;
  return firstSentence.replace(/\.+$/, "").trim() || null;
}

// ---------------------------------------------------------------------------
// Decision badges
// ---------------------------------------------------------------------------

type DecisionMeta = { label: string; className: string };

const DECISION_META: Record<ToolConnectionTestDecision, DecisionMeta> = {
  allowed: {
    label: t("appDetail.test.allowed"),
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  ask_first: {
    label: t("appDetail.test.askFirst"),
    className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  off: {
    label: t("appDetail.test.off"),
    className: "border-border bg-muted text-muted-foreground",
  },
};

function DecisionBadge({ decision }: { decision: ToolConnectionTestDecision }) {
  const meta = DECISION_META[decision];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

/** "Allowed for 1 action · Ask first for 2 · Off for 1" — singular gets " action". */
function summaryCount(label: string, n: number): string {
  return t("appDetail.test.summaryCount", { label, count: n });
}

function accessSummaryLine(summary: ToolConnectionAccessSummary): string {
  return [
    summaryCount(t("appsResidualRound3.allowedFor"), summary.allowedCount),
    summaryCount(t("appsResidualRound3.askFirstFor"), summary.askFirstCount),
    summaryCount(t("appsResidualRound3.offForCount"), summary.offCount),
  ].join(" · ");
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function TestPanel({
  connectionId,
  appName,
  active,
  quarantined = [],
}: {
  connectionId: string;
  appName: string;
  /** Active (non-quarantined, non-removed) catalog entries. */
  active: ToolCatalogEntry[];
  /** New, not-yet-reviewed actions — shown as Off so they're reachable to test. */
  quarantined?: ToolCatalogEntry[];
}) {
  const testAgentsQuery = useQuery({
    queryKey: queryKeys.tools.testAgents(connectionId),
    queryFn: () => toolsApi.listTestAgents(connectionId),
    enabled: !!connectionId,
  });

  const agents = useMemo(
    () => [...(testAgentsQuery.data?.agents ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [testAgentsQuery.data],
  );

  const [agentId, setAgentId] = useState<string | null>(null);
  // Default to the first agent (alphabetical) that can run at least one action;
  // otherwise the first agent we can test as at all.
  useEffect(() => {
    if (agentId && agents.some((a) => a.id === agentId)) return;
    if (agents.length === 0) return;
    const withAccess = agents.find((a) => a.effectiveAccess.allowedCount > 0);
    setAgentId((withAccess ?? agents[0]).id);
  }, [agents, agentId]);

  // Switches the header from "TEST AS" card to the compact "Testing as …" line.
  const [hasInteracted, setHasInteracted] = useState(false);

  const selectedAgent = agents.find((a) => a.id === agentId) ?? null;

  // Per-action decision for the selected agent, keyed by both the upstream and
  // gateway tool names so we can match whatever the catalog stores.
  const decisionByTool = useMemo(() => {
    const map = new Map<string, ToolConnectionTestDecision>();
    for (const tool of selectedAgent?.effectiveAccess.tools ?? []) {
      map.set(tool.toolName, tool.decision);
      map.set(tool.gatewayToolName, tool.decision);
    }
    return map;
  }, [selectedAgent]);

  const decisionFor = (entry: ToolCatalogEntry): ToolConnectionTestDecision =>
    decisionByTool.get(entry.toolName) ?? "off";

  // Search + read/write filter.
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "read" | "write">("all");

  const byName = (a: ToolCatalogEntry, b: ToolCatalogEntry) =>
    (a.title ?? a.toolName).localeCompare(b.title ?? b.toolName);
  const readActions = active.filter((e) => e.isReadOnly).sort(byName);
  const writeActions = active.filter((e) => !e.isReadOnly).sort(byName);

  const matches = (entry: ToolCatalogEntry) => {
    if (kindFilter === "read" && !entry.isReadOnly) return false;
    if (kindFilter === "write" && entry.isReadOnly) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      (entry.title ?? entry.toolName).toLowerCase().includes(needle) ||
      (entry.description ?? "").toLowerCase().includes(needle)
    );
  };

  const quarantinedActions = [...quarantined].sort(byName);

  const visibleRead = readActions.filter(matches);
  const visibleWrite = writeActions.filter(matches);
  const visibleQuarantined = quarantinedActions.filter(matches);
  const visibleCount = visibleRead.length + visibleWrite.length + visibleQuarantined.length;

  if (testAgentsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (active.length === 0 && quarantinedActions.length === 0) {
    return <EmptyState connectionId={connectionId} appName={appName} />;
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm font-medium text-foreground">{t("appDetail.test.noAgents")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t("appDetail.test.noAgentsHint", { app: appName })}{" "}
          <Link className="font-medium text-primary hover:underline" to={appTabHref(connectionId, "permissions")}>
            {t("appDetail.test.permissions")}
          </Link>{" "}
          to test it here.
        </p>
      </div>
    );
  }

  const sharedRowProps = {
    connectionId,
    appName,
    allAgents: agents,
    onSelectAgent: setAgentId,
    onInteract: () => setHasInteracted(true),
  };

  return (
    <div className="space-y-5">
      {selectedAgent && (
        <TestAsHeader
          appName={appName}
          agents={agents}
          selectedAgent={selectedAgent}
          onSelect={setAgentId}
          connectionId={connectionId}
          compact={hasInteracted}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-(--sz-12rem) flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("appDetail.test.findAction")}
              placeholder={t("appDetail.test.findAction") + "…"}
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <FilterChip label={t("appDetail.test.filterAll", { count: active.length + quarantinedActions.length })} active={kindFilter === "all"} onClick={() => setKindFilter("all")} />
          <FilterChip label={t("appDetail.test.filterRead", { count: readActions.length })} active={kindFilter === "read"} onClick={() => setKindFilter("read")} />
          <FilterChip label={t("appDetail.test.filterWrite", { count: writeActions.length })} active={kindFilter === "write"} onClick={() => setKindFilter("write")} />
        </div>
        <p className="text-xs text-muted-foreground">{t("appDetail.test.matches", { count: visibleCount })}</p>
      </div>

      {visibleCount === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("appDetail.test.noMatches", { query })}
        </div>
      ) : (
        <div className="space-y-6">
          {visibleRead.length > 0 && selectedAgent && (
            <ActionGroup
              heading={t("appDetail.test.groupRead", { count: visibleRead.length })}
              entries={visibleRead}
              decisionFor={decisionFor}
              agent={selectedAgent}
              {...sharedRowProps}
            />
          )}
          {visibleWrite.length > 0 && selectedAgent && (
            <ActionGroup
              heading={t("appDetail.test.groupWrite", { count: visibleWrite.length })}
              entries={visibleWrite}
              decisionFor={decisionFor}
              agent={selectedAgent}
              {...sharedRowProps}
            />
          )}
          {visibleQuarantined.length > 0 && selectedAgent && (
            <ActionGroup
              heading={t("appDetail.test.groupNew", { count: visibleQuarantined.length })}
              subheading={t("appDetail.test.newHint")}
              entries={visibleQuarantined}
              decisionFor={() => "off" as const}
              agent={selectedAgent}
              {...sharedRowProps}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ connectionId, appName }: { connectionId: string; appName: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center">
      <p className="text-base font-bold text-foreground">{t("appDetail.test.empty")}</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        {t("appDetail.test.emptyHint", { app: appName })}
      </p>
      <Button asChild className="mt-4" variant="outline">
        <Link to={appTabHref(connectionId, "setup")}>{t("appDetail.test.goToSetup")}</Link>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test-as header + agent picker
// ---------------------------------------------------------------------------

function TestAsHeader({
  appName,
  agents,
  selectedAgent,
  onSelect,
  connectionId,
  compact,
}: {
  appName: string;
  agents: ToolConnectionTestAgent[];
  selectedAgent: ToolConnectionTestAgent;
  onSelect: (agentId: string) => void;
  connectionId: string;
  compact: boolean;
}) {
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p className="text-sm text-muted-foreground">
          {t("appDetail.test.testingAs")}{" "}
          <AgentPicker
            agents={agents}
            selectedAgent={selectedAgent}
            onSelect={onSelect}
            connectionId={connectionId}
            appName={appName}
            inline
          />
        </p>
        <p className="text-xs text-muted-foreground">{accessSummaryLine(selectedAgent.effectiveAccess)}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.testAs")}</p>
          <AgentPicker
            agents={agents}
            selectedAgent={selectedAgent}
            onSelect={onSelect}
            connectionId={connectionId}
            appName={appName}
          />
        </div>
        <p className="text-sm text-muted-foreground">{accessSummaryLine(selectedAgent.effectiveAccess)}</p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("appDetail.test.runsAsAgent", { app: appName })}
      </p>
    </div>
  );
}

function AgentPicker({
  agents,
  selectedAgent,
  onSelect,
  connectionId,
  appName,
  inline,
}: {
  agents: ToolConnectionTestAgent[];
  selectedAgent: ToolConnectionTestAgent;
  onSelect: (agentId: string) => void;
  connectionId: string;
  appName: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "items-center gap-1.5 text-foreground outline-none hover:text-primary focus-visible:text-primary",
            inline ? "inline-flex font-semibold underline-offset-2 hover:underline" : "mt-0.5 flex text-lg font-bold",
          )}
          aria-label={t("appDetail.test.chooseAgent")}
        >
          {selectedAgent.name}
          <ChevronsUpDown className={cn("text-muted-foreground", inline ? "h-3.5 w-3.5" : "h-4 w-4")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("appDetail.test.searchAgents")}
              placeholder={t("appDetail.test.searchAgents") + "…"}
              className="h-8 pl-8 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t("appDetail.test.noAgentsMatch")}</p>
          ) : (
            filtered.map((agent) => {
              const summary = agent.effectiveAccess;
              const noAccess = summary.allowedCount === 0 && summary.askFirstCount === 0;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    onSelect(agent.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-accent",
                    agent.id === selectedAgent.id && "bg-accent",
                  )}
                >
                  <Check
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      agent.id === selectedAgent.id ? "text-primary" : "text-transparent",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{agent.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {noAccess
                        ? t("appDetail.test.noAccess")
                        : t("appDetail.test.accessSummary", { allowed: summary.allowedCount, askFirst: summary.askFirstCount, off: summary.offCount })}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-(length:--text-micro) text-muted-foreground">
          <p>{t("appDetail.test.assignableOnly")}</p>
          <p>{t("appDetail.test.previewAs", { app: appName })}</p>
        </div>
        <div className="border-t border-border p-3">
          <p className="text-xs font-semibold text-foreground">{t("appDetail.test.badgesMeaning")}</p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            <li><span className="font-medium text-foreground">{t("appDetail.test.allowed")}</span> — {t("appDetail.test.allowedHint")}</li>
            <li><span className="font-medium text-foreground">{t("appDetail.test.askFirst")}</span> — {t("appDetail.test.askFirstHint")}</li>
            <li>
              <span className="font-medium text-foreground">{t("appDetail.test.off")}</span> — {t("appDetail.test.offHint")}{" "}
              <Link className="text-primary hover:underline" to={appTabHref(connectionId, "permissions")}>
                {t("appDetail.test.permissions")}
              </Link>.
            </li>
          </ul>
          <p className="mt-2 text-(length:--text-micro) text-muted-foreground">
            {t("appDetail.test.badgesHint")}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Action group + rows
// ---------------------------------------------------------------------------

type RowSharedProps = {
  connectionId: string;
  appName: string;
  allAgents: ToolConnectionTestAgent[];
  onSelectAgent: (agentId: string) => void;
  onInteract: () => void;
};

function ActionGroup({
  heading,
  subheading,
  entries,
  decisionFor,
  agent,
  ...shared
}: {
  heading: string;
  subheading?: string;
  entries: ToolCatalogEntry[];
  decisionFor: (entry: ToolCatalogEntry) => ToolConnectionTestDecision;
  agent: ToolConnectionTestAgent;
} & RowSharedProps) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h3>
      {subheading && <p className="mb-1.5 -mt-1 text-xs text-muted-foreground">{subheading}</p>}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {entries.map((entry) => (
          <ActionRow
            key={entry.id}
            entry={entry}
            decision={decisionFor(entry)}
            agent={agent}
            {...shared}
          />
        ))}
      </div>
    </section>
  );
}

function ActionRow({
  entry,
  decision,
  agent,
  ...shared
}: {
  entry: ToolCatalogEntry;
  decision: ToolConnectionTestDecision;
  agent: ToolConnectionTestAgent;
} & RowSharedProps) {
  const [open, setOpen] = useState(() => Boolean(loadStoredAskFirstOutcome(shared.connectionId, entry, agent)));
  const title = entry.title ?? entry.toolName;
  const sub = actionSubLine(entry);

  useEffect(() => {
    if (loadStoredAskFirstOutcome(shared.connectionId, entry, agent)) {
      setOpen(true);
    }
  }, [shared.connectionId, entry, agent]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
        >
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
          </span>
          <DecisionBadge decision={decision} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border bg-muted/20 px-4 py-4">
          <ActionTester entry={entry} decision={decision} agent={agent} {...shared} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// The actual tester (form + run + result)
// ---------------------------------------------------------------------------

type RunOutcome = {
  result: ToolConnectionTestCallResult;
  agentName: string;
  durationMs: number;
  ranAt: Date;
};

function testOutcomeStorageKey(connectionId: string, entry: ToolCatalogEntry, agentId: string): string {
  return `paperclip:test-call:${connectionId}:${agentId}:${entry.id}:${entry.toolName}`;
}

function loadStoredAskFirstOutcome(connectionId: string, entry: ToolCatalogEntry, agent: ToolConnectionTestAgent): RunOutcome | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(testOutcomeStorageKey(connectionId, entry, agent.id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      result?: ToolConnectionTestCallResult;
      agentName?: string;
      durationMs?: number;
      ranAt?: string;
    };
    if (!parsed.result || parsed.result.decision !== "ask_first" || typeof parsed.result.actionRequestId !== "string") {
      return null;
    }
    return {
      result: parsed.result,
      agentName: parsed.agentName || agent.name,
      durationMs: typeof parsed.durationMs === "number" ? parsed.durationMs : 0,
      ranAt: parsed.ranAt ? new Date(parsed.ranAt) : new Date(),
    };
  } catch {
    return null;
  }
}

function storeAskFirstOutcome(connectionId: string, entry: ToolCatalogEntry, agentId: string, outcome: RunOutcome | null) {
  if (typeof window === "undefined") return;
  const key = testOutcomeStorageKey(connectionId, entry, agentId);
  try {
    if (!outcome || outcome.result.decision !== "ask_first") {
      window.sessionStorage.removeItem(key);
      return;
    }
    window.sessionStorage.setItem(key, JSON.stringify({ ...outcome, ranAt: outcome.ranAt.toISOString() }));
  } catch {
    // Session storage is only a same-tab convenience. If it is unavailable, the
    // request is still visible in Review and the backend lifecycle remains intact.
  }
}

/** Fold optional fields behind the JsonSchemaForm "More options" disclosure. */
function splitRequiredOptional(schema: JsonSchemaNode): JsonSchemaNode {
  const required = new Set(schema.required ?? []);
  const props = schema.properties ?? {};
  const next: Record<string, JsonSchemaNode> = {};
  for (const [key, prop] of Object.entries(props)) {
    next[key] = required.has(key) ? prop : { ...prop, "x-paperclip-advanced": true };
  }
  return { ...schema, properties: next };
}

const GUT_CHECK: Record<ToolConnectionTestDecision, (app: string, agent: string) => string> = {
  allowed: (app, agent) => t("appDetail.test.allowedWarning", { app, agent }),
  ask_first: () => t("appDetail.test.askFirstWarning"),
  off: (_app, agent) => t("appDetail.test.offWarning", { agent }),
};

function ActionTester({
  entry,
  decision,
  connectionId,
  appName,
  agent,
  allAgents,
  onSelectAgent,
  onInteract,
}: {
  entry: ToolCatalogEntry;
  decision: ToolConnectionTestDecision;
  agent: ToolConnectionTestAgent;
} & RowSharedProps) {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const rawSchema = (entry.inputSchema ?? { type: "object", properties: {} }) as JsonSchemaNode;
  const formSchema = useMemo(() => splitRequiredOptional(rawSchema), [rawSchema]);
  const [values, setValues] = useState<Record<string, unknown>>(() => getDefaultValues(rawSchema));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<RunOutcome | null>(() =>
    loadStoredAskFirstOutcome(connectionId, entry, agent)
  );

  // Running card state — keep the spinner visible ≥200ms (anti-flicker).
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  const isOff = decision === "off";

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
    return () => window.clearInterval(id);
  }, [running]);

  const run = useMutation({
    mutationFn: async () => {
      const result = await toolsApi.runTestCall(connectionId, {
        agentId: agent.id,
        toolName: entry.toolName,
        parameters: values,
      });
      return result;
    },
    onSuccess: (result) => {
      if (cancelledRef.current) return;
      const durationMs = Date.now() - startedAtRef.current;
      const finish = () => {
        if (cancelledRef.current) return;
        const nextOutcome = { result, agentName: agent.name, durationMs, ranAt: new Date() };
        setRunning(false);
        setOutcome(nextOutcome);
        storeAskFirstOutcome(connectionId, entry, agent.id, nextOutcome);
        queryClient.invalidateQueries({ queryKey: queryKeys.tools.connectionActivity(connectionId) });
        if (selectedCompanyId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.tools.actionRequests(selectedCompanyId, "pending") });
          queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId) });
        }
      };
      const remaining = 200 - durationMs;
      if (remaining > 0) window.setTimeout(finish, remaining);
      else finish();
    },
    onError: () => {
      if (cancelledRef.current) return;
      setRunning(false);
    },
  });

  const onRun = () => {
    const validationErrors = validateJsonSchemaForm(rawSchema, values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;
    onInteract();
    cancelledRef.current = false;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setOutcome(null);
    setRunning(true);
    run.mutate();
  };

  const onReset = () => {
    cancelledRef.current = true;
    setRunning(false);
    setOutcome(null);
    storeAskFirstOutcome(connectionId, entry, agent.id, null);
    setErrors({});
    setValues(getDefaultValues(rawSchema));
  };

  const onCancelRunning = () => {
    cancelledRef.current = true;
    setRunning(false);
  };

  if (isOff) {
    return (
      <OffExplanation
        entry={entry}
        connectionId={connectionId}
        appName={appName}
        agent={agent}
        allAgents={allAgents}
        onSelectAgent={onSelectAgent}
      />
    );
  }

  const hasFields = Object.keys(rawSchema.properties ?? {}).length > 0;

  return (
    <div className="space-y-4">
      {hasFields ? (
        <JsonSchemaForm
          schema={formSchema}
          values={values}
          onChange={setValues}
          errors={errors}
          disabled={running}
          advancedLabel={t("appDetail.test.moreOptions")}
        />
      ) : (
        <p className="text-xs text-muted-foreground">{t("appDetail.test.noInputs")}</p>
      )}

      <p className="text-xs text-muted-foreground">{GUT_CHECK[decision](appName, agent.name)}</p>

      <div className="flex items-center gap-2">
        <Button onClick={onRun} disabled={running} size="sm">
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("appsResidualRound3.running")}
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" /> {outcome ? t("appDetail.test.runAgain") : t("appDetail.test.run")}
            </>
          )}
        </Button>
        <Button onClick={onReset} disabled={running} size="sm" variant="ghost">
          {t("appsResidualRound3.reset")}
        </Button>
      </div>

      {running && (
        <RunningCard entry={entry} appName={appName} agentName={agent.name} elapsedMs={elapsedMs} onCancel={onCancelRunning} />
      )}

      {run.isError && !running && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t("appDetail.test.couldntReach", { agent: agent.name })} {run.error instanceof Error ? run.error.message : t("appDetail.errors.tryAgain")}
        </div>
      )}

      {outcome && !running && (
        <ResultPanel outcome={outcome} entry={entry} appName={appName} connectionId={connectionId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Running card (T6)
// ---------------------------------------------------------------------------

function RunningCard({
  entry,
  appName,
  agentName,
  elapsedMs,
  onCancel,
}: {
  entry: ToolCatalogEntry;
  appName: string;
  agentName: string;
  elapsedMs: number;
  onCancel: () => void;
}) {
  const verb = entry.isReadOnly ? t("appDetail.test.readingFrom") : entry.isWrite ? t("appDetail.test.writingTo") : t("appDetail.test.calling");
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">{t("appDetail.test.running")}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {verb} {appName} as {agentName}.
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t("appDetail.test.startedAgo", { time: seconds(elapsedMs) })}</span>
        <Button onClick={onCancel} size="sm" variant="outline">
          {t("appsResidualRound3.cancel")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result branches
// ---------------------------------------------------------------------------

function ResultPanel({
  outcome,
  entry,
  appName,
  connectionId,
}: {
  outcome: RunOutcome;
  entry: ToolCatalogEntry;
  appName: string;
  connectionId: string;
}) {
  const { result } = outcome;
  if (result.decision === "ask_first") {
    return <AskFirstResult outcome={outcome} entry={entry} appName={appName} connectionId={connectionId} />;
  }
  if (result.decision === "off") {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        {result.error?.message ?? t("appDetail.test.actionOff")}
      </div>
    );
  }
  // The gateway can return `decision:"allowed"` (policy let the call through) yet
  // the upstream MCP tool still fails at the tool layer (`isError:true` in the
  // result envelope). Surface that as a failure card, not the green "Worked" one.
  const toolError = result.error ?? mcpToolError(result.result);
  if (toolError) {
    return <ErrorResult outcome={outcome} appName={appName} connectionId={connectionId} error={toolError} />;
  }
  return <AllowedResult outcome={outcome} entry={entry} appName={appName} connectionId={connectionId} />;
}

/**
 * A tool can return `decision:"allowed"` and still fail at the MCP layer — the
 * gateway normalizes that into `{ data: { isError: true }, error: "…" }` inside
 * the result envelope. Pull a renderable error out of that shape, or null when
 * the result is a clean success.
 */
function mcpToolError(value: unknown): { message: string; reasonCode: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const envelope = value as Record<string, unknown>;
  const data = envelope.data && typeof envelope.data === "object" ? (envelope.data as Record<string, unknown>) : null;
  const isError = data?.isError === true || envelope.isError === true;
  if (!isError) return null;
  // Prefer what the app actually said (normalized content text) over the generic
  // gateway wrapper string, falling back to a friendly default.
  const message =
    (typeof envelope.content === "string" && envelope.content.trim() !== "" && envelope.content)
    || (typeof envelope.error === "string" && envelope.error.trim() !== "" && envelope.error)
    || t("appDetail.test.appError");
  return { message, reasonCode: "tool_error" };
}

// --- Allowed (T7) ---------------------------------------------------------

/** Pull a row array out of a tool result for the "n rows came back" heuristic. */
function asRows(value: unknown): Record<string, unknown>[] | null {
  const isObjArray = (v: unknown): v is Record<string, unknown>[] =>
    Array.isArray(v) && v.length > 0 && v.every((i) => i !== null && typeof i === "object" && !Array.isArray(i));
  if (isObjArray(value)) return value;
  if (value && typeof value === "object") {
    for (const key of ["rows", "values", "items", "data", "results"]) {
      const inner = (value as Record<string, unknown>)[key];
      if (isObjArray(inner)) return inner as Record<string, unknown>[];
    }
  }
  return null;
}

function isEmptyResult(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function writeVerb(entry: ToolCatalogEntry): string | null {
  const n = `${entry.toolName} ${entry.title ?? ""}`.toLowerCase();
  if (/\b(append|add|insert|create|new)\b/.test(n)) return "added";
  if (/\b(update|edit|set|patch|change|modify)\b/.test(n)) return "updated";
  if (/\b(delete|remove|clear|trash)\b/.test(n)) return "removed";
  return null;
}

function successHeadline(value: unknown, entry: ToolCatalogEntry, appName: string): string {
  const verb = writeVerb(entry);
  if (!entry.isReadOnly && verb) return t("appDetail.test.workedVerb", { verb });
  const rows = asRows(value);
  if (rows) return t("appDetail.test.workedRows", { count: rows.length });
  if (isEmptyResult(value)) return t("appDetail.test.workedEmpty");
  return t("appDetail.test.workedResult", { app: appName });
}

function AllowedResult({
  outcome,
  entry,
  appName,
  connectionId,
}: {
  outcome: RunOutcome;
  entry: ToolCatalogEntry;
  appName: string;
  connectionId: string;
}) {
  const value = outcome.result.result;
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
      <div className="flex items-center gap-2">
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-medium text-foreground">{successHeadline(value, entry, appName)}</span>
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {t("appsResidualRound3.runningAs", { agent: outcome.agentName, duration: seconds(outcome.durationMs), time: relTime(outcome.ranAt) })}
      </p>

      {!isEmptyResult(value) && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.preview")}</p>
          <div className="mt-1.5">
            <PrettyPreview value={value} />
          </div>
        </div>
      )}

      <RawResponseDisclosure value={value} />

      <p className="mt-3 text-xs text-muted-foreground">
        {t("appsResidualRound3.callInActivity")} {" "}
        <Link className="text-primary hover:underline" to={appTabHref(connectionId, "activity")}>
          {t("appsResidualRound3.activityTab")}
        </Link>
        .
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("appDetail.test.lastRun", { time: seconds(outcome.durationMs) })}</p>
    </div>
  );
}

/** Pretty preview: table for row arrays, depth-limited JSON otherwise, plain text for strings. */
function PrettyPreview({ value }: { value: unknown }) {
  const rows = asRows(value);
  if (rows) {
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).slice(0, 6);
    const shown = rows.slice(0, 6);
    return (
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-2.5 py-1.5 font-medium">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col} className="px-2.5 py-1.5 text-foreground">{cellText(row[col])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > shown.length && (
          <p className="px-2.5 py-1.5 text-(length:--text-micro) text-muted-foreground">… {rows.length - shown.length} more rows</p>
        )}
      </div>
    );
  }
  if (typeof value === "string") {
    return <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background p-3 text-xs text-foreground">{value}</pre>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-foreground">
      {safeStringify(collapseDeep(value, 2))}
    </pre>
  );
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return Array.isArray(value) ? `[${value.length}]` : "{…}";
  return String(value);
}

/** Replace objects deeper than `maxDepth` with a placeholder so the tree stays readable. */
function collapseDeep(value: unknown, maxDepth: number, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= maxDepth) return Array.isArray(value) ? "[…]" : "{…}";
  if (Array.isArray(value)) return value.map((v) => collapseDeep(v, maxDepth, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = collapseDeep(v, maxDepth, depth + 1);
  }
  return out;
}

function RawResponseDisclosure({ value }: { value: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  if (value === undefined || value === null) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setShowRaw((prev) => !prev)}
        className="text-xs font-semibold uppercase tracking-wide text-primary hover:underline"
      >
        {showRaw ? t("appDetail.test.hideRaw") : t("appDetail.test.showRaw")}
      </button>
      {showRaw && (
        <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-xs text-foreground">
          {safeStringify(value)}
        </pre>
      )}
    </div>
  );
}

// --- Error (T8) -----------------------------------------------------------

function ErrorResult({
  outcome,
  appName,
  connectionId,
  error,
}: {
  outcome: RunOutcome;
  appName: string;
  connectionId: string;
  error: { message: string; reasonCode: string | null };
}) {
  const hints = errorHints(error.message, error.reasonCode);
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-foreground">{t("appDetail.test.didntWork")}</span>
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {t("appsResidualRound3.triedAs", { agent: outcome.agentName, duration: seconds(outcome.durationMs), time: relTime(outcome.ranAt) })}
      </p>
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.whatAppSaid", { app: appName })}</p>
        <p className="mt-1 break-words text-sm text-foreground">{error.message}</p>
        {error.reasonCode && <p className="mt-0.5 text-xs text-muted-foreground">{t("appsResidualRound3.code")} {error.reasonCode}</p>}
      </div>
      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.whatToTry")}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-foreground">
          {hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("appDetail.test.adjustAndRetry")}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("appsResidualRound3.alsoVisibleIn")} {" "}
        <Link className="text-primary hover:underline" to={appTabHref(connectionId, "activity")}>
          {t("appsResidualRound3.activityTab")}
        </Link>
        .
      </p>
    </div>
  );
}

// --- Ask first (T9) — live status polled from the action-request snapshot ---

/** Phases that have settled — once reached, the panel stops polling. */
const TERMINAL_PHASES: ReadonlySet<ToolConnectionTestCallStatus["phase"]> = new Set([
  "done",
  "denied",
  "cancelled",
  "expired",
]);

/** Compact "Where" line from the redacted parameter snapshot: `key: value` pairs. */
function formatWhere(parameters: Record<string, unknown> | null | undefined): string | null {
  if (!parameters) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(parameters)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    parts.push(`${key}: ${String(value)}`);
    if (parts.length >= 3) break;
  }
  return parts.length ? parts.join(" · ") : null;
}

function AskFirstResult({
  outcome,
  entry,
  appName,
  connectionId,
}: {
  outcome: RunOutcome;
  entry: ToolCatalogEntry;
  appName: string;
  connectionId: string;
}) {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const actionRequestId = outcome.result.actionRequestId;
  const [cancelled, setCancelled] = useState(false);

  const statusQuery = useQuery({
    queryKey: queryKeys.tools.testCallStatus(connectionId, actionRequestId ?? "__none__"),
    queryFn: () => toolsApi.getTestCallStatus(connectionId, actionRequestId!),
    enabled: !!actionRequestId && !cancelled,
    // Poll until the request settles (approved+done, denied, cancelled, expired).
    refetchInterval: (query) => {
      const phase = query.state.data?.phase;
      return phase && TERMINAL_PHASES.has(phase) ? false : 2000;
    },
  });

  const cancel = useMutation({
    mutationFn: () => toolsApi.declineActionRequest(selectedCompanyId!, actionRequestId!),
    onSuccess: () => {
      setCancelled(true);
      queryClient.invalidateQueries({ queryKey: queryKeys.tools.actionRequests(selectedCompanyId!, "pending") });
      if (selectedCompanyId) queryClient.invalidateQueries({ queryKey: queryKeys.apps.attention(selectedCompanyId) });
    },
  });

  const status = statusQuery.data;
  const phase: ToolConnectionTestCallStatus["phase"] = cancelled ? "cancelled" : status?.phase ?? "waiting";

  // Once the call has been approved and run, mutate into the real result shape
  // so the tester sees the response (or failure) without re-running.
  if (phase === "done" && status) {
    // Same as the allowed path: an approved call can still fail at the MCP tool
    // layer (isError:true in the envelope) without a top-level error.
    const toolError = status.error ?? mcpToolError(status.result);
    if (toolError) {
      const errorOutcome: RunOutcome = {
        result: { decision: "allowed", invocationId: status.invocationId, error: toolError },
        agentName: outcome.agentName,
        durationMs: status.durationMs ?? outcome.durationMs,
        ranAt: status.resolvedAt ? new Date(status.resolvedAt) : outcome.ranAt,
      };
      return <ErrorResult outcome={errorOutcome} appName={appName} connectionId={connectionId} error={toolError} />;
    }
    const allowedOutcome: RunOutcome = {
      result: { decision: "allowed", invocationId: status.invocationId, result: status.result },
      agentName: outcome.agentName,
      durationMs: status.durationMs ?? outcome.durationMs,
      ranAt: status.resolvedAt ? new Date(status.resolvedAt) : outcome.ranAt,
    };
    return <AllowedResult outcome={allowedOutcome} entry={entry} appName={appName} connectionId={connectionId} />;
  }

  const requestedAt = status?.requestedAt ? new Date(status.requestedAt) : outcome.ranAt;
  const where = formatWhere(status?.parameters);
  const statusLabel =
    phase === "running"
      ? t("appDetail.test.approvedRunning")
      : phase === "denied"
        ? t("appDetail.test.deniedSeeReview")
        : phase === "cancelled"
          ? t("appDetail.test.cancelled")
          : phase === "expired"
          ? t("appDetail.test.expired")
          : t("appDetail.test.waiting", { time: relTime(requestedAt) });
  const settled = phase === "denied" || phase === "cancelled" || phase === "expired";

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2">
        <ShieldQuestion className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm font-medium text-foreground">{t("appDetail.test.sentForApproval")}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{outcome.agentName} needs your approval before this runs.</p>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.action")}</dt>
          <dd className="text-foreground">{entry.title ?? entry.toolName}</dd>
        </div>
        {where && (
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.where")}</dt>
            <dd className="break-words text-foreground">{where}</dd>
          </div>
        )}
        <div className="flex gap-3">
          <dt className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.status")}</dt>
          <dd className={cn("flex items-center gap-1.5 text-foreground", settled && "text-muted-foreground")}>
            {phase === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
            {statusLabel}
          </dd>
        </div>
      </dl>

      {!settled && (
        <p className="mt-3 text-sm text-foreground">
          {t("appsResidualRound3.approveInReview")} {" "}
          <Link className="font-medium text-primary hover:underline" to={appTabHref(connectionId, "review")}>
            {t("appsResidualRound3.reviewTab")}
          </Link>{" "}
          {t("appsResidualRound3.finishTest")}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={appTabHref(connectionId, "review")}>{t("appDetail.test.openReview")}</Link>
        </Button>
        {phase === "waiting" && actionRequestId && selectedCompanyId && (
          <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {cancel.isPending ? t("appDetail.test.cancelling") : t("appDetail.test.cancelRequest")}
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Off (T10) ------------------------------------------------------------

function OffExplanation({
  entry,
  connectionId,
  appName,
  agent,
  allAgents,
  onSelectAgent,
}: {
  entry: ToolCatalogEntry;
  connectionId: string;
  appName: string;
  agent: ToolConnectionTestAgent;
  allAgents: ToolConnectionTestAgent[];
  onSelectAgent: (agentId: string) => void;
}) {
  const title = entry.title ?? entry.toolName;
  const permHref = `${appTabHref(connectionId, "permissions")}?focus=${encodeURIComponent(entry.id)}`;

  // Decision for this action across every agent we can test as.
  const others = allAgents.filter((a) => a.id !== agent.id);
  const decisionOf = (a: ToolConnectionTestAgent): ToolConnectionTestDecision => {
    const tool = a.effectiveAccess.tools.find(
      (t) => t.toolName === entry.toolName || t.gatewayToolName === entry.toolName,
    );
    return tool?.decision ?? "off";
  };
  const allOff = allAgents.every((a) => decisionOf(a) === "off");

  const whyBody = entry.status === "quarantined"
    ? t("appDetail.test.newActionOff")
    : allOff
      ? t("appDetail.test.adminTurnedOff")
      : t("appsResidualRound3.offProfile", { agent: agent.name });

  // "Last changed by {Actor} · {relativeTime}" — only the access config carries
  // this; a quarantined action has never been configured, so there's nothing to
  // attribute. Actor is omitted when the latest edit isn't agent-attributable.
  const { lastChangedAt, lastChangedByName } = agent.effectiveAccess;
  const auditHint =
    entry.status !== "quarantined" && lastChangedAt
      ? `${t("appsResidualRound3.lastChanged")}${lastChangedByName ? t("appsResidualRound3.lastChangedBy", { name: lastChangedByName }) : ""} · ${relTime(new Date(lastChangedAt))}`
      : null;

  const otherSettings = others.map((a) => ({ name: a.name, decision: decisionOf(a) }));
  const tryAgents = others.filter((a) => decisionOf(a) !== "off");

  return (
    <div className="grid gap-3 md:grid-cols-(--gtc-62)">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{t("appsResidualRound3.offFor", { title, agent: agent.name })}</p>
            <p className="mt-0.5">{t("appDetail.test.wontRun")}</p>
            <p className="mt-2">
              {t("appsResidualRound3.wantToTest", { agent: agent.name })}{" "}
              <Link className="font-medium text-primary hover:underline" to={appTabHref(connectionId, "permissions")}>
                {t("appsResidualRound3.permissions")}
              </Link>{" "}
              {t("appsResidualRound3.setAllowedAskFirst")}
            </p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link to={permHref}>{t("appDetail.test.openPermissions")} →</Link>
        </Button>
        <p className="text-xs text-muted-foreground">{t("appDetail.test.noCall", { agent: agent.name })}</p>
      </div>

      <aside className="rounded-md border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("appDetail.test.whyOff")}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{whyBody}</p>
        {auditHint && <p className="mt-1.5 text-(length:--text-micro) text-muted-foreground">{auditHint}</p>}
        {otherSettings.length > 0 && (
          <div className="mt-3">
            <p className="text-(length:--text-micro) font-medium text-muted-foreground">{t("appDetail.test.otherAgents", { app: appName })}</p>
            <ul className="mt-1 space-y-0.5 text-(length:--text-micro) text-muted-foreground">
              {otherSettings.map((s) => (
                <li key={s.name}>
                  {s.name}: <span className="text-foreground">{DECISION_META[s.decision].label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tryAgents.length > 0 && (
          <div className="mt-3">
            <p className="text-(length:--text-micro) font-medium text-muted-foreground">{t("appDetail.test.tryDifferentAgent")}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tryAgents.slice(0, 4).map((other) => (
                <button
                  key={other.id}
                  type="button"
                  onClick={() => onSelectAgent(other.id)}
                  className="rounded-full border border-border px-2.5 py-1 text-(length:--text-micro) font-medium text-foreground hover:bg-accent"
                >
                  {other.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Tailored next steps keyed on the upstream/gateway error. Mirrors the
 * board-accepted copy-spec error-hint lookup (NOT_FOUND / PERMISSION_DENIED /
 * INVALID_ARGUMENT / RATE_LIMIT) with the locked generic fallback otherwise.
 */
export function errorHints(message: string, reasonCode: string | null | undefined): string[] {
  const haystack = `${reasonCode ?? ""} ${message}`.toUpperCase();
  if (haystack.includes("NOT_FOUND")) {
    return [
      t("appDetail.test.errorHints.notFoundId"),
      t("appDetail.test.errorHints.notFoundAccess"),
    ];
  }
  if (haystack.includes("PERMISSION") || haystack.includes("FORBIDDEN") || haystack.includes("UNAUTHORIZED")) {
    return [
      t("appDetail.test.errorHints.permissionAccount"),
      t("appDetail.test.errorHints.permissionReconnect"),
    ];
  }
  if (haystack.includes("INVALID_ARGUMENT") || haystack.includes("INVALID") || haystack.includes("BAD_REQUEST")) {
    return [
      t("appDetail.test.errorHints.invalidFields"),
      t("appDetail.test.errorHints.invalidOptions"),
    ];
  }
  if (haystack.includes("RATE_LIMIT") || haystack.includes("RESOURCE_EXHAUSTED") || haystack.includes("429")) {
    return [t("appDetail.test.errorHints.rateLimit")];
  }
  // Locked generic fallback (copy-spec decision #2).
  return [t("appDetail.test.errorHints.generic")];
}
