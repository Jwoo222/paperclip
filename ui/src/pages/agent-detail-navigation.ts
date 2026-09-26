import { t as tNewUi } from "@/i18n";
import { auditSectionHref, type AuditSection } from "./audit/audit-navigation";

export type AgentDetailView =
  | "overview"
  | "instructions"
  | "skills"
  | "runtime"
  | "secrets"
  | "tools"
  | "channels"
  | "permissions"
  | "api-keys"
  | "revisions"
  | "run-detail";

export type AgentLocalDetailView = Exclude<AgentDetailView, "run-detail">;

export const AGENT_DETAIL_NAVIGATION: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ value: AgentLocalDetailView; label: string }>;
}> = [
  {
    label: tNewUi("newUi.k11b39c93777e"),
    items: [
      { value: "overview", label: tNewUi("newUi.kd4b1ea5708dd") },
      { value: "instructions", label: tNewUi("newUi.k934652dce41d") },
      { value: "skills", label: tNewUi("newUi.k66d0f523a379") },
    ],
  },
  {
    label: tNewUi("newUi.k109311589787"),
    items: [
      { value: "runtime", label: "Harness / Runtime" },
      { value: "secrets", label: tNewUi("newUi.kd8707d411d99") },
      { value: "tools", label: tNewUi("newUi.kea93d6a262ec") },
      { value: "channels", label: tNewUi("newUi.k4c8906cf76f5") },
    ],
  },
  {
    label: tNewUi("newUi.k86f8a694159b"),
    items: [
      { value: "permissions", label: "Permissions / Trust" },
      { value: "api-keys", label: tNewUi("newUi.kc08f17eb9e11") },
      { value: "revisions", label: tNewUi("newUi.kda80b1d5740c") },
    ],
  },
] as const;

export function parseAgentDetailView(value: string | null): AgentLocalDetailView {
  if (value === "instructions" || value === "prompts") return "instructions";
  if (value === "skills") return "skills";
  if (value === "runtime" || value === "configure" || value === "configuration") return "runtime";
  if (value === "secrets") return "secrets";
  if (value === "tools") return "tools";
  if (value === "channels") return "channels";
  if (value === "permissions" || value === "trust") return "permissions";
  if (value === "api-keys" || value === "keys") return "api-keys";
  if (value === "revisions" || value === "history") return "revisions";
  return "overview";
}

export function agentDetailHref(agentRef: string, view: AgentLocalDetailView = "overview") {
  return `/agents/${agentRef}/${view}`;
}

export function agentLegacyAuditSection(value: string | null): AuditSection | null {
  if (value === "runs") return "runs";
  if (value === "audit" || value === "activity") return "activity";
  if (value === "cost" || value === "costs") return "costs";
  if (value === "budget" || value === "budgets") return "budgets";
  return null;
}

export function agentScopedAuditHref(agentId: string, section: AuditSection) {
  return auditSectionHref(section, {
    mode: section === "activity" ? "agents" : undefined,
    agentId,
  });
}
