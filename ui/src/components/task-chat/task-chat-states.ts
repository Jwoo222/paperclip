import { t } from "@/i18n";

/**
 * Canonical state inventory for the Task Chat Redesign (flag:
 * enableTaskChatRedesign).
 *
 * This list is the single source of truth for:
 *   - the dev harness state switcher (/dev/task-chat-lab), and
 *   - the finish-line test that asserts every state renders without error.
 *
 * Each id traces to a real agent-protocol state (plan Deliverable 1). `tier`
 * marks whether the state already streams live ("live") or is emitted upstream
 * but dropped by acpx today ("tier-b", driven by synthetic events in the
 * harness, live wiring flagged). `surface` says where the state renders.
 */

export const TASK_CHAT_STATES = [
  "session-start",
  "human-message",
  "agent-message",
  "thinking",
  "responding",
  "responding-burst",
  "tool-call",
  "diff",
  "working",
  "running",
  "completed",
  "awaiting-approval",
  "plan-todo",
  "interrupted",
  "refused",
  "truncated",
  "live-token-cost",
] as const;

export type TaskChatStateId = (typeof TASK_CHAT_STATES)[number];

export type TaskChatStateTier = "live" | "tier-b";
export type TaskChatStateSurface = "thread" | "plan";

export interface TaskChatStateMeta {
  id: TaskChatStateId;
  label: string;
  tier: TaskChatStateTier;
  surface: TaskChatStateSurface;
  /** Real protocol source, quoted for the harness inspector. */
  protocol: string;
}

export const TASK_CHAT_STATE_META: Record<TaskChatStateId, TaskChatStateMeta> = {
  "session-start": {
    id: "session-start",
    label: t("commonChatTools.sessionStart"),
    tier: "live",
    surface: "thread",
    protocol: 'acpx.session → TranscriptEntry kind:"init"',
  },
  "human-message": {
    id: "human-message",
    label: t("commonChatTools.humanMessage"),
    tier: "live",
    surface: "thread",
    protocol: 'IssueComment authorType:"user"',
  },
  "agent-message": {
    id: "agent-message",
    label: t("commonChatTools.agentMessage"),
    tier: "live",
    surface: "thread",
    protocol: "text_delta stream:output (ACP agent_message_chunk)",
  },
  thinking: {
    id: "thinking",
    label: t("commonChatTools.thinking"),
    tier: "live",
    surface: "thread",
    protocol: "text_delta stream:thought (ACP agent_thought_chunk)",
  },
  responding: {
    id: "responding",
    label: t("commonChatTools.respondingStreaming"),
    tier: "live",
    surface: "thread",
    protocol: "text_delta stream:output, streaming",
  },
  "responding-burst": {
    id: "responding-burst",
    label: t("commonChatTools.respondingBurst"),
    tier: "live",
    surface: "thread",
    protocol: "text_delta stream:output ×N, tool calls between (PAP-368 dwell)",
  },
  "tool-call": {
    id: "tool-call",
    label: t("commonChatTools.toolCall"),
    tier: "live",
    surface: "thread",
    protocol: "acpx.tool_call (ACP tool_call / tool_call_update)",
  },
  diff: {
    id: "diff",
    label: t("commonChatTools.diff"),
    tier: "live",
    surface: "thread",
    protocol: 'ToolCallContent type:"diff" → TranscriptEntry kind:"diff"',
  },
  working: {
    id: "working",
    label: t("commonChatTools.working"),
    tier: "live",
    surface: "thread",
    protocol: "heartbeat.run.progress + acpx.status",
  },
  running: {
    id: "running",
    label: t("commonChatTools.running"),
    tier: "live",
    surface: "thread",
    protocol: 'message.status.type === "running"',
  },
  completed: {
    id: "completed",
    label: t("commonChatTools.completedCollapsed"),
    tier: "live",
    surface: "thread",
    protocol: "acpx.result (StopReason in subtype)",
  },
  "awaiting-approval": {
    id: "awaiting-approval",
    label: t("commonChatTools.awaitingApproval"),
    tier: "tier-b",
    surface: "thread",
    protocol: "ACP RequestPermissionRequest + PermissionOptionKind",
  },
  "plan-todo": {
    id: "plan-todo",
    label: t("commonChatTools.planTodo"),
    tier: "tier-b",
    surface: "plan",
    protocol: "ACP Plan { entries: PlanEntry[] }, PlanEntryStatus",
  },
  interrupted: {
    id: "interrupted",
    label: t("commonChatTools.interrupted"),
    tier: "tier-b",
    surface: "thread",
    protocol: 'AcpRuntimeTurnResult.status:"cancelled" / StopReason "cancelled"',
  },
  refused: {
    id: "refused",
    label: t("commonChatTools.refused"),
    tier: "tier-b",
    surface: "thread",
    protocol: 'StopReason "refusal"',
  },
  truncated: {
    id: "truncated",
    label: t("commonChatTools.truncated"),
    tier: "tier-b",
    surface: "thread",
    protocol: 'StopReason "max_tokens" | "max_turn_requests"',
  },
  "live-token-cost": {
    id: "live-token-cost",
    label: t("commonChatTools.liveTokenCost"),
    tier: "tier-b",
    surface: "thread",
    protocol: "ACP UsageUpdate { used, size, cost }",
  },
};

export const TASK_CHAT_STATE_LIST: TaskChatStateMeta[] = TASK_CHAT_STATES.map(
  (id) => TASK_CHAT_STATE_META[id],
);
