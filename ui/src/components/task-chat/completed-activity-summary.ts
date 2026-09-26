import { t as tNewUi } from "@/i18n";
import { Brain, CirclePause, Gauge, Layers3 } from "lucide-react";
import type { TaskChatActivityPhaseItem } from "./task-chat-model";
import {
  toolActivityPresentation,
  type ToolFamily,
  type ToolIcon,
} from "./tool-taxonomy";
import { protocolActivityPresentation } from "./task-chat-activity-presentation";

type Activity = TaskChatActivityPhaseItem["items"][number];
const labels: Record<ToolFamily, string> = {
  terminal: tNewUi("newUi.k80905baf3aae"),
  grep: tNewUi("newUi.ke82a2af2a22f"),
  search: tNewUi("newUi.ke82a2af2a22f"),
  read: tNewUi("newUi.k4e792beef219"),
  edit: tNewUi("newUi.k5d9a85d72cd7"),
  web: tNewUi("newUi.k7d2580ce3dea"),
  plan: tNewUi("newUi.kcc9edfa1e141"),
  question: tNewUi("newUi.k9ac27bf45925"),
  agent: tNewUi("newUi.k8e1471062f03"),
  safety: tNewUi("newUi.kb9971493654f"),
  image: tNewUi("newUi.kd8966505b596"),
  wait: tNewUi("newUi.ka1b56198592b"),
  mcp: tNewUi("newUi.k084d97476500"),
  other: tNewUi("newUi.k836c94ab8f0d"),
};

/** Describe observed activities, never infer success from a finished group. */
export function completedActivitySummary(items: Activity[]) {
  const categories = new Map<
    string,
    { label: string; icon: ToolIcon; order: number }
  >();
  const add = (label: string, icon: ToolIcon, order = 0) => {
    const existing = categories.get(label);
    if (!existing || order < existing.order)
      categories.set(label, { label, icon, order });
  };
  const tools: Array<{
    family: ToolFamily;
    icon: ToolIcon;
    completed: boolean;
    order: number;
  }> = [];
  for (const [order, item] of items.entries()) {
    if (item.kind === "tool") {
      const p = toolActivityPresentation({
        name: item.rawName ?? item.name,
        target: item.target,
      });
      tools.push({ ...p, order, completed: item.status === "completed" });
    } else if (item.kind === "protocol") {
      if (
        item.surface === "provider_activity" &&
        item.family === "tool_execution"
      ) {
        const value = (label: string) =>
          item.details.find((d) => d.label === label)?.value;
        const p = toolActivityPresentation({
          name: value("Name"),
          operation: value("Operation"),
          transport: value("Transport"),
          namespace: value("Namespace"),
          target: value("Target"),
        });
        tools.push({ ...p, order, completed: item.status === "completed" });
      } else {
        const p = protocolActivityPresentation(item);
        if (!p) continue;
        const family =
          item.surface === "provider_activity" ? item.family : item.surface;
        const label =
          (
            {
              research: tNewUi("newUi.k7d2580ce3dea"),
              plan: tNewUi("newUi.kcc9edfa1e141"),
              delegation: tNewUi("newUi.k8e1471062f03"),
              artifact: tNewUi("newUi.k0b98b99f2fc7"),
              context: tNewUi("newUi.kfa532ff325ae"),
              memory: tNewUi("newUi.ka022dec00248"),
              model_identity: tNewUi("newUi.k732eed0f5875"),
              review: tNewUi("newUi.k984354470b19"),
              hook: tNewUi("newUi.kbb7a271beb44"),
              safety: tNewUi("newUi.kb9971493654f"),
              terminal: tNewUi("newUi.k80905baf3aae"),
              wait: tNewUi("newUi.ka1b56198592b"),
              provider_notice: tNewUi("newUi.k7bd94199ab60"),
              workspace_change: tNewUi("newUi.k624abb5df7ca"),
              workspace_file: tNewUi("newUi.k3373b282ac12"),
              resource: tNewUi("newUi.k66d79b24a58f"),
            } as Record<string, string>
          )[family] ?? tNewUi("newUi.k836c94ab8f0d");
        add(label, p.icon, order);
      }
    }
  }
  const completedFamilies = new Set(
    tools.filter((tool) => tool.completed).map((tool) => tool.family),
  );
  // Merge repeated families and retries. Terminal is an action, not an exit-status claim.
  for (const tool of tools) {
    const succeeded = completedFamilies.has(tool.family);
    const label =
      tool.family === "read" && !succeeded
        ? tNewUi("newUi.k5eccc3a120c7")
        : tool.family === "edit" && !succeeded
          ? tNewUi("newUi.k624abb5df7ca")
          : labels[tool.family];
    add(label, tool.icon, tool.order);
  }
  if (!categories.size) {
    if (items.some((item) => item.kind === "thinking"))
      add(tNewUi("newUi.k9257b9ec74c2"), Brain);
    else if (items.some((item) => item.kind === "marker"))
      add(tNewUi("newUi.k98e2e327b5c9"), CirclePause);
    else add(tNewUi("newUi.kfce3c2264f76"), Gauge);
  }
  const values = [...categories.values()].sort((a, b) => a.order - b.order);
  const join = (parts: string[]) =>
    parts
      .map((p, i) => (i ? p.charAt(0).toLowerCase() + p.slice(1) : p))
      .join(", ");
  const fullLabel = join(values.map((v) => v.label));
  return {
    label:
      values.length > 3
        ? `${join(values.slice(0, 2).map((v) => v.label))}, and more`
        : fullLabel,
    fullLabel,
    icon: values.length === 1 ? values[0].icon : Layers3,
  };
}
