import { t as tNewUi } from "@/i18n";
/**
 * Exhaustive product disposition for Paperclip Runner Protocol surfaces.
 *
 * This is intentionally separate from the renderer: adding a protocol event
 * must be a conscious product decision even when the decision is to fold it
 * into an existing turn or keep it in DevTools. The contract test compares
 * these keys with the canonical JSON schemas.
 */
export type TaskProtocolDisposition = "inline" | "folded" | "debug-only";

export interface TaskProtocolSurfaceRegistration {
  disposition: TaskProtocolDisposition;
  surface: string;
  story: string | null;
  rationale: string;
}

const inline = (surface: string, story: string, rationale: string): TaskProtocolSurfaceRegistration => ({
  disposition: "inline",
  surface,
  story,
  rationale,
});

const folded = (surface: string, rationale: string): TaskProtocolSurfaceRegistration => ({
  disposition: "folded",
  surface,
  story: null,
  rationale,
});

const debugOnly = (surface: string, rationale: string): TaskProtocolSurfaceRegistration => ({
  disposition: "debug-only",
  surface,
  story: null,
  rationale,
});

const providerEvents = [
  "plan.updated",
  "tool.execution.started", "tool.execution.progressed", "tool.execution.completed",
  "research.started", "research.progressed", "research.completed",
  "delegation.started", "delegation.updated", "delegation.completed",
  "model.route.changed", "model.verification.updated", "context.compacted",
  "artifact.viewed", "artifact.generated", "review.mode.changed",
  "hook.started", "hook.completed", "memory.citation.referenced",
  "safety.review.started", "safety.review.completed", "terminal.input.sent",
  "wait.started", "wait.completed", "provider.notice.recorded",
] as const;

const runnerLifecycleEvents = [
  "runner.connected", "runner.reconnected", "runner.reconciled", "runner.disconnected",
  "runner.draining", "runner.backpressure", "runner.suspending", "runner.suspended", "runner.stopped",
  "runtime.phase.changed", "workspace.ready",
  "harness.starting", "harness.ready", "harness.exited",
  "session.starting", "session.started", "session.resuming", "session.resumed",
  "session.reconciled", "session.updated", "session.closed",
  "turn.submitted", "turn.accepted", "turn.started", "turn.completed",
  "run.attached", "run.detached",
] as const;

const diagnosticEvents = [
  "runner.diagnostic", "harness.diagnostic", "session.failed", "turn.failed",
  "turn.interrupted", "turn.cancelled", "item.failed",
] as const;

const itemEvents = ["item.started", "item.delta", "item.completed", "usage.reported"] as const;

const mcpLifecycleEvents = [
  "mcp_app.discovered", "mcp_app.resource.resolved", "mcp_app.initializing", "mcp_app.ready",
  "mcp_app.host_context.changed", "mcp_app.failed", "mcp_app.teardown",
] as const;

const interactionLifecycleEvents = [
  "interaction.request.proposed", "interaction.request.materialized", "interaction.request.rejected",
  "interaction.response.progressed", "interaction.response.resolved", "interaction.response.delivered",
] as const;

const governanceEvents = [
  "attention.request.proposed", "attention.request.routed", "attention.request.resolved",
  "attention.request.expired", "attention.request.superseded", "work.assessment.recorded",
  "issue.status.decision.recorded", "issue.status.decision.applied", "issue.status.decision.rejected",
  "issue.status.decision.superseded",
] as const;

export const TASK_PROTOCOL_EVENT_SURFACE_REGISTRY: Readonly<Record<string, TaskProtocolSurfaceRegistration>> = Object.freeze({
  ...Object.fromEntries(providerEvents.map((eventType) => [eventType, inline("provider_activity", tNewUi("newUi.k3391abb06159"), tNewUi("newUi.k30f4691f4bf6"))])),
  "workspace.change.updated": inline("workspace_change", tNewUi("newUi.k1ec635873115"), tNewUi("newUi.kfcc97153c323")),
  "workspace.diff.recorded": inline("workspace_change", tNewUi("newUi.k1ec635873115"), tNewUi("newUi.k870eeff1f3d6")),
  "workspace.file.referenced": inline("workspace_file", tNewUi("newUi.k383a7194044a"), tNewUi("newUi.k71b3ac3fc459")),
  "semantic_tool.input": folded("tool", tNewUi("newUi.kd1ad38671fb7")),
  "semantic_tool.result": folded("tool", tNewUi("newUi.ke509283e1984")),
  "semantic_tool.reconciled": folded("tool", tNewUi("newUi.k90b6386b288c")),
  "mcp_app.tool_input": folded("tool", tNewUi("newUi.k706b57a1cb5b")),
  "mcp_app.tool_result": folded("tool", tNewUi("newUi.k36a73a601722")),
  "mcp_app.action.requested": folded("interaction", tNewUi("newUi.k02a894bf63fa")),
  "mcp_app.action.resolved": folded("interaction", tNewUi("newUi.k3e498424e1c9")),
  "runtime_request.created": inline("runtime_request", tNewUi("newUi.kcc3f991fafee"), tNewUi("newUi.kf3a7dcf4e239")),
  "runtime_request.resolved": folded("runtime_request", tNewUi("newUi.k64daeb42db9e")),
  "runtime_request.expired": folded("runtime_request", tNewUi("newUi.k8197ecb89a1f")),
  "runtime_request.cancelled": folded("runtime_request", tNewUi("newUi.kc01bd420269a")),
  ...Object.fromEntries(interactionLifecycleEvents.map((eventType) => [eventType, folded("interaction", tNewUi("newUi.k36d700efdfaa") )])),
  "run.result.proposed": inline("run_result", tNewUi("newUi.ke9b470526790"), tNewUi("newUi.ke4e088022736")),
  "run.result.accepted": folded("run_result", tNewUi("newUi.k41549c462baf")),
  "run.result.rejected": folded("run_result", tNewUi("newUi.ked574e66b8b0")),
  "run.terminal": inline("run_terminal", tNewUi("newUi.ke9b470526790"), tNewUi("newUi.kaf6a319af04c")),
  ...Object.fromEntries(runnerLifecycleEvents.map((eventType) => [eventType, folded("turn", tNewUi("newUi.k4b0f7e3780d3"))])),
  ...Object.fromEntries(diagnosticEvents.map((eventType) => [eventType, folded("system_notice", tNewUi("newUi.k112bc65b21a0"))])),
  ...Object.fromEntries(itemEvents.map((eventType) => [eventType, folded("conversation_or_tool", tNewUi("newUi.kc09f70a45767") )])),
  "auth.credentials.updated": debugOnly("run_debug", tNewUi("upgrade1029ConflictsC.credentialUpdatesNotifyHost")),
  "sandbox.metric": debugOnly("run_debug", tNewUi("newUi.keb4d900e8161")),
  ...Object.fromEntries(mcpLifecycleEvents.map((eventType) => [eventType, debugOnly("run_debug", tNewUi("newUi.kfb94465279b0"))])),
  ...Object.fromEntries(governanceEvents.map((eventType) => [eventType, folded("governance", tNewUi("newUi.ka8c965ab1123") )])),
});

export const TASK_PROTOCOL_REQUEST_SURFACE_REGISTRY = Object.freeze({
  "runtime.permission": inline("runtime_request", tNewUi("newUi.kcc3f991fafee"), tNewUi("newUi.k5b1912f70286")),
  "runtime.input": inline("runtime_request", tNewUi("newUi.kcc3f991fafee"), tNewUi("newUi.kc8b36510789c")),
  "issue_thread.request_confirmation": inline("interaction", tNewUi("newUi.ked2e9b972b39"), tNewUi("newUi.k956e2e3803ce")),
  "issue_thread.request_checkbox_confirmation": inline("interaction", tNewUi("newUi.ked2e9b972b39"), tNewUi("newUi.k60fe4205a3fc")),
  "issue_thread.request_item_verdicts": inline("interaction", tNewUi("newUi.ked2e9b972b39"), tNewUi("newUi.ka246c122b7a4")),
  "issue_thread.ask_user_questions": inline("interaction", tNewUi("newUi.ked2e9b972b39"), tNewUi("newUi.k0aa6a1d4f660")),
  "issue_thread.suggest_tasks": inline("interaction", tNewUi("newUi.ked2e9b972b39"), tNewUi("newUi.k432e17585ca9")),
});

export const TASK_PROTOCOL_RESULT_DISPOSITION_REGISTRY = Object.freeze({
  done: "run_result",
  blocked: "run_result",
  needs_review: "run_result",
  yielded: "run_result",
} as const);

export const TASK_PROTOCOL_TURN_TERMINAL_REGISTRY = Object.freeze({
  completed: "run_terminal",
  failed: "run_terminal",
  interrupted: "run_terminal",
  cancelled: "run_terminal",
} as const);

export const TASK_PROTOCOL_RUN_TERMINAL_REGISTRY = Object.freeze({
  succeeded: "run_terminal",
  failed: "run_terminal",
  cancelled: "run_terminal",
} as const);
