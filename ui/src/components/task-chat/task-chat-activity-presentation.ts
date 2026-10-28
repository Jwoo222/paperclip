import { t as tNewUi } from "@/i18n";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  Box,
  Clock3,
  Database,
  FileCheck2,
  FilePenLine,
  FileText,
  GitBranch,
  Info,
  ListChecks,
  PackageCheck,
  Search,
  ShieldCheck,
  TerminalSquare,
  Users,
} from "lucide-react";
import type {
  TaskChatMaterializedResourceItem,
  TaskChatProtocolItem,
  TaskChatProviderActivityItem,
  TaskChatWorkspaceChangeItem,
  TaskChatWorkspaceFileItem,
} from "./task-chat-model";
import {
  humanizeToolName,
  isGenericToolName,
  mcpToolIdentity,
  toolActivityPresentation,
  type ToolIcon,
} from "./tool-taxonomy";

export interface TaskChatActivityPresentation {
  icon: ToolIcon;
  runningLabel: string;
  completedLabel: string;
  failedLabel?: string;
  interruptedLabel?: string;
  detail?: string;
}

export function providerNoticeSeverity(item: TaskChatProviderActivityItem): "info" | "warning" | "error" {
  const severity = item.details.find((entry) => entry.label === "Severity")?.value;
  if (item.status === "failed" || severity === "error") return "error";
  return severity === "info" ? "info" : "warning";
}

function providerDetail(item: TaskChatProviderActivityItem, ...labels: string[]): string | undefined {
  return item.details.find((entry) => labels.includes(entry.label))?.value;
}

function meaningfulToolDetail(value: string | undefined): string | undefined {
  if (!value || isGenericToolName(value) || /^tool(?:\s+|_)call\b/i.test(value)) return undefined;
  return value;
}

export function providerActivityPresentation(item: TaskChatProviderActivityItem): TaskChatActivityPresentation {
  const detail = item.summary
    ?? providerDetail(item, "Query", "URL", "Target", "Name", "Reference", "Reason", "Summary");
  switch (item.family) {
    case "research": {
      const action = providerDetail(item, "Action")?.toLowerCase();
      if (action === "open_page") {
        return { icon: Search, runningLabel: tNewUi("newUi.kd077e535b002"), completedLabel: tNewUi("newUi.k6c63ef87315e"), failedLabel: tNewUi("newUi.kce7b208ffda4"), interruptedLabel: tNewUi("newUi.kd0a382d9f296"), detail };
      }
      if (action === "find_in_page") {
        return { icon: Search, runningLabel: tNewUi("newUi.kcee87e693295"), completedLabel: tNewUi("newUi.k034155f531fb"), failedLabel: tNewUi("newUi.k6dfaa4d68d60"), interruptedLabel: tNewUi("newUi.k9bd2b622d34e"), detail };
      }
      return { icon: Search, runningLabel: tNewUi("newUi.k87d2f3386f90"), completedLabel: tNewUi("newUi.k7d2580ce3dea"), failedLabel: tNewUi("newUi.kd5f6f62970a0"), interruptedLabel: tNewUi("newUi.k1eaec1fa131e"), detail };
    }
    case "tool_execution": {
      const name = providerDetail(item, "Name");
      const target = providerDetail(item, "Target");
      const progress = providerDetail(item, "Progress");
      const tool = toolActivityPresentation({
        name,
        transport: providerDetail(item, "Transport"),
        namespace: providerDetail(item, "Namespace"),
        operation: providerDetail(item, "Operation"),
        target,
        progress,
      });
      const boundedActivity = meaningfulToolDetail(item.summary)
        ?? meaningfulToolDetail(progress)
        ?? meaningfulToolDetail(target);
      const activityIsIdentity = Boolean(
        boundedActivity && name && humanizeToolName(boundedActivity) === humanizeToolName(name),
      );
      const technicalName = name ? mcpToolIdentity(name)?.name ?? name : tool.displayName;
      const source = tool.sourceLabel
        ? `${tool.sourceLabel} · ${technicalName}`
        : name && !isGenericToolName(name) && humanizeToolName(name) !== tool.runningLabel.replace(/^Running /, "")
          ? name
          : undefined;
      return {
        icon: tool.icon,
        runningLabel: tool.runningLabel,
        completedLabel: tool.completedLabel,
        failedLabel: tool.failedLabel,
        interruptedLabel: tool.interruptedLabel,
        detail: [activityIsIdentity ? undefined : boundedActivity, source].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "plan":
      return { icon: ListChecks, runningLabel: tNewUi("newUi.kad15b385c3ae"), completedLabel: tNewUi("newUi.k519f941ff016"), failedLabel: tNewUi("newUi.k8f3501ac6d28"), interruptedLabel: tNewUi("newUi.kd0c9665f04ce"), detail };
    case "delegation": {
      const action = providerDetail(item, "Action")?.toLowerCase();
      if (action === "message") return { icon: Users, runningLabel: "Messaging a subagent", completedLabel: "Messaged a subagent", failedLabel: tNewUi("newUi.k1695191804b8"), interruptedLabel: tNewUi("newUi.k0308220cee43"), detail };
      if (action === "resume") return { icon: Users, runningLabel: "Resuming a subagent", completedLabel: "Resumed a subagent", failedLabel: tNewUi("newUi.kc28a63b382c3"), interruptedLabel: tNewUi("newUi.kf263e4702087"), detail };
      if (action === "close") return { icon: Users, runningLabel: "Closing a subagent", completedLabel: "Closed a subagent", failedLabel: tNewUi("newUi.k6bdb15f04ea9"), interruptedLabel: tNewUi("newUi.k2ddd545a1d42"), detail };
      if (action === "wait") return { icon: Users, runningLabel: tNewUi("newUi.k6f824f2d8724"), completedLabel: tNewUi("newUi.k6045c00d68ad"), failedLabel: tNewUi("newUi.k0989af59a6a6"), interruptedLabel: tNewUi("newUi.kea938ec1e800"), detail };
      return { icon: Users, runningLabel: "Starting a subagent", completedLabel: "Started a subagent", failedLabel: tNewUi("newUi.k174da562e84d"), interruptedLabel: tNewUi("newUi.kc20ecab2240b"), detail };
    }
    case "model_identity":
      return item.eventType === "model.route.changed"
        ? { icon: Bot, runningLabel: tNewUi("newUi.k6548f0a329f5"), completedLabel: tNewUi("newUi.k20b44e9956b3"), failedLabel: tNewUi("newUi.k0b114fa9a5f9"), interruptedLabel: tNewUi("newUi.kd3e6ad79cee3"), detail }
        : { icon: Bot, runningLabel: tNewUi("newUi.k183a019bc5cf"), completedLabel: tNewUi("newUi.k747ff089067d"), failedLabel: tNewUi("newUi.k6438143fd7ef"), interruptedLabel: tNewUi("newUi.kab3a62d05f80"), detail };
    case "context":
      return { icon: Database, runningLabel: tNewUi("newUi.k67afcd229f27"), completedLabel: tNewUi("newUi.k3ab4e4383fa2"), failedLabel: tNewUi("newUi.kfe784dc10020"), interruptedLabel: tNewUi("newUi.k596578e709f4"), detail };
    case "artifact": {
      const viewed = item.eventType === "artifact.viewed";
      return viewed
        ? { icon: Box, runningLabel: tNewUi("newUi.kb9a13ce2cc9b"), completedLabel: tNewUi("newUi.k0e3de18e7d3f"), failedLabel: tNewUi("newUi.k15eb744ea2f6"), interruptedLabel: tNewUi("newUi.k98ba0907947c"), detail }
        : { icon: Box, runningLabel: tNewUi("newUi.k3b80030d5fa3"), completedLabel: tNewUi("newUi.k0e082eaffc32"), failedLabel: tNewUi("newUi.k2992c24e11dd"), interruptedLabel: tNewUi("newUi.k942db7981bba"), detail };
    }
    case "review": {
      const state = providerDetail(item, "State")?.toLowerCase();
      return state === "exited"
        ? { icon: FileCheck2, runningLabel: tNewUi("newUi.k6313d443ab9f"), completedLabel: tNewUi("newUi.k179f6cd446ec"), failedLabel: tNewUi("newUi.ka7615977a95d"), interruptedLabel: tNewUi("newUi.k38c90437dc45"), detail }
        : { icon: FileCheck2, runningLabel: tNewUi("newUi.k78cd9c798ee0"), completedLabel: tNewUi("newUi.kbd39b94a7bc0"), failedLabel: tNewUi("newUi.ka6ac7669a99b"), interruptedLabel: tNewUi("newUi.k38c90437dc45"), detail };
    }
    case "hook":
      return { icon: GitBranch, runningLabel: "Running a hook", completedLabel: "Ran a hook", failedLabel: tNewUi("newUi.k15da67993dfc"), interruptedLabel: tNewUi("newUi.ka9bec2429002"), detail };
    case "memory":
      return { icon: BookOpen, runningLabel: tNewUi("newUi.k5de3b4c49d5a"), completedLabel: tNewUi("newUi.k1cb14e05ba43"), failedLabel: tNewUi("newUi.k1e1c97b6b795"), interruptedLabel: tNewUi("newUi.k09bccee50350"), detail };
    case "safety":
      return { icon: ShieldCheck, runningLabel: tNewUi("newUi.k12058b2f4b03"), completedLabel: tNewUi("newUi.kb9971493654f"), failedLabel: tNewUi("newUi.k856a6d36a90c"), interruptedLabel: tNewUi("newUi.ke480e64109e1"), detail };
    case "terminal":
      return { icon: TerminalSquare, runningLabel: tNewUi("newUi.k5ec4a24b65a5"), completedLabel: tNewUi("newUi.ka82acfef674f"), failedLabel: tNewUi("newUi.k894ae1cd9a6a"), interruptedLabel: tNewUi("newUi.kbb214e1d7efe"), detail };
    case "wait":
      return { icon: Clock3, runningLabel: tNewUi("newUi.k6e293a8c009e"), completedLabel: tNewUi("newUi.k864b0af064bd"), failedLabel: tNewUi("newUi.k5b8f59dd9225"), interruptedLabel: tNewUi("newUi.k31f13b8f589e"), detail };
    case "provider_notice":
      return { icon: providerNoticeSeverity(item) === "info" ? Info : AlertTriangle, runningLabel: tNewUi("newUi.k72afcaa86714"), completedLabel: tNewUi("newUi.k72afcaa86714"), failedLabel: tNewUi("newUi.k9ade31ecd1b5"), interruptedLabel: tNewUi("newUi.k72afcaa86714"), detail };
  }
}

function workspaceChangePresentation(item: TaskChatWorkspaceChangeItem): TaskChatActivityPresentation {
  const count = item.totals.files || item.files.length;
  const detail = count > 0 ? `${count} ${count === 1 ? "file" : "files"}` : undefined;
  return { icon: FilePenLine, runningLabel: tNewUi("newUi.kd868fdd01755"), completedLabel: tNewUi("newUi.k5d9a85d72cd7"), detail };
}

function workspaceFilePresentation(item: TaskChatWorkspaceFileItem): TaskChatActivityPresentation {
  return {
    icon: FileText,
    runningLabel: "Referencing a file",
    completedLabel: "Referenced a file",
    detail: item.line == null ? item.path : `${item.path}:${item.line}`,
  };
}

function resourcePresentation(item: TaskChatMaterializedResourceItem): TaskChatActivityPresentation {
  return {
    icon: item.resourceKind === "document" ? FileText : PackageCheck,
    runningLabel: "Saving a resource",
    completedLabel: item.resourceKind === "document" ? "Added a document" : "Added a deliverable",
    detail: item.title,
  };
}

export function protocolActivityPresentation(item: TaskChatProtocolItem): TaskChatActivityPresentation | null {
  switch (item.surface) {
    case "provider_activity": return providerActivityPresentation(item);
    case "workspace_change": return workspaceChangePresentation(item);
    case "workspace_file": return workspaceFilePresentation(item);
    case "resource": return resourcePresentation(item);
    case "runtime_request":
    case "run_result":
    case "run_terminal":
      return null;
  }
}

export function protocolActivityIsRunning(item: TaskChatProtocolItem): boolean {
  if (item.surface === "provider_activity") return item.status === "running";
  if (item.surface === "workspace_change") return !item.complete;
  return false;
}

export function protocolActivityLabel(item: TaskChatProtocolItem, presentation: TaskChatActivityPresentation): string {
  if (item.surface !== "provider_activity") {
    return protocolActivityIsRunning(item) ? presentation.runningLabel : presentation.completedLabel;
  }
  if (item.status === "failed") return presentation.failedLabel ?? `${presentation.completedLabel} · failed`;
  if (item.status === "interrupted") return presentation.interruptedLabel ?? `${presentation.completedLabel} · interrupted`;
  return item.status === "running" ? presentation.runningLabel : presentation.completedLabel;
}
