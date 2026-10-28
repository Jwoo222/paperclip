import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import type { Agent, AgentLifecycleState } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { t } from "@/i18n";

// Locale keys under upgrade1029NewComponents.agentLifecycleStatus; resolved with t() at render time.
const phases = {
  preparing: ["preparingTitle", "preparingDetail"],
  verifying: ["verifyingTitle", "verifyingDetail"],
  pausing: ["pausingTitle", "pausingDetail"],
  resuming: ["resumingTitle", "resumingDetail"],
  terminating: ["terminatingTitle", "terminatingDetail"],
  cleaning_up: ["cleaningUpTitle", "cleaningUpDetail"],
} satisfies Partial<Record<AgentLifecycleState, [string, string]>>;

const failedPhases = {
  preparing: "preparingFailed", verifying: "verifyingFailed",
  pausing: "pausingFailed", resuming: "resumingFailed",
  terminating: "terminatingFailed", cleaning_up: "cleaningUpFailed",
};

function lifecycleCopy(key: string) {
  return t(`upgrade1029NewComponents.agentLifecycleStatus.${key}`);
}

function pendingPhase(state?: AgentLifecycleState) {
  return state && state in phases ? phases[state as keyof typeof phases] : undefined;
}

export function agentLifecycleRefetchInterval(state?: AgentLifecycleState) {
  return pendingPhase(state) ? 2_000 : 30_000;
}

/** Poll lifecycle fields without refreshing the record used by editable forms. */
export function useAgentLifecycleStatus(agent?: Agent) {
  return useQuery({
    queryKey: [...queryKeys.agents.detail(agent?.id ?? ""), "lifecycle", agent?.companyId],
    queryFn: () => agentsApi.get(agent!.id, agent!.companyId),
    enabled: Boolean(agent),
    select: current => ({ status: current.status, lifecycleState: current.lifecycleState,
      lifecycleVersion: current.lifecycleVersion, lifecycleError: current.lifecycleError }),
    refetchInterval: query => agentLifecycleRefetchInterval(query.state.data?.lifecycleState ?? agent?.lifecycleState),
  });
}

export function AgentLifecycleStatus({ agent, onRetry, retryPending, refreshError = false }: {
  agent: Pick<Agent, "lifecycleState" | "lifecycleError">;
  onRetry: () => void;
  retryPending: boolean;
  refreshError?: boolean;
}) {
  const phase = pendingPhase(agent.lifecycleState);
  if (!phase && !refreshError) return null;
  return <div role="status" aria-live="polite" className="space-y-2 text-sm">
    {refreshError && <p className="text-destructive">{t("upgrade1029NewComponents.agentLifecycleStatus.refreshFailed")}</p>}
    {phase && <div className="flex flex-wrap items-center gap-2">
      <Badge variant={agent.lifecycleError ? "destructive" : "secondary"}>
        {!agent.lifecycleError && <Loader2 aria-hidden="true" className="mr-1 size-3 animate-spin motion-reduce:animate-none" />}
        {lifecycleCopy(agent.lifecycleError ? failedPhases[agent.lifecycleState as keyof typeof failedPhases] : phase[0])}
      </Badge>
      {!agent.lifecycleError && <span className="text-muted-foreground">{lifecycleCopy(phase[1])}</span>}
    </div>}
    {phase && agent.lifecycleError && <div className="flex flex-wrap items-center gap-2 text-destructive">
      <span>{agent.lifecycleError}</span>
      <Button variant="outline" size="sm" disabled={retryPending} onClick={onRetry}>
        {retryPending ? t("issueProperties.retrying") : t("issueProperties.retryNow")}
      </Button>
    </div>}
    {phase && agent.lifecycleError && <p className="text-muted-foreground">{t("upgrade1029NewComponents.agentLifecycleStatus.retryHint")}</p>}
  </div>;
}
