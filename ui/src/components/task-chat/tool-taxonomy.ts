/**
 * Shared tool taxonomy: raw ACP tool_call names ("Bash", "Grep",
 * "mcp__<server>__<tool>", …) → { family, icon, verbLabel } so the live status
 * pill, the chat tool rows, and the classic transcript all agree on which
 * glyph and verb a tool gets. The Wrench is reserved for genuinely unknown
 * tools.
 */
import {
  BookOpen,
  Brain,
  ChevronsLeftRightEllipsis,
  MessageSquareReply,
  Network,
  Search,
  SearchCode,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { McpIcon } from "./McpIcon";
import { t } from "@/i18n";

/** Lucide icons and hand-rolled SVGs (the MCP logo) share this shape. */
export type ToolIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type ToolFamily =
  | "terminal"
  | "grep"
  | "search"
  | "read"
  | "edit"
  | "web"
  | "agent"
  | "mcp"
  | "other";

export interface ToolTaxonomyEntry {
  family: ToolFamily;
  icon: ToolIcon;
  /** Progressive verb for the status pill, without the trailing ellipsis. */
  verbLabel: string;
}

/**
 * Placeholder names that carry no tool identity. acpx fills a tool_call_update
 * whose ACP payload omits `title` with the literal "tool call", and older
 * stored logs carry "tool call (completed)" / "acp_tool" variants — none of
 * these should ever displace a real name like "Terminal" or "Read".
 */
const GENERIC_TOOL_NAMES = new Set(["tool", "tool call", "tool_call", "acp_tool"]);

export function isGenericToolName(name: string | undefined | null): boolean {
  const raw = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\((?:pending|in_progress|completed|failed|cancelled)\)$/, "");
  return !raw || GENERIC_TOOL_NAMES.has(raw);
}

/**
 * Collapse an MCP tool name ("mcp__server__tool") to its tool segment,
 * capitalized — the same rule toolDisplayName() applies. Returns null for
 * non-MCP names.
 */
export function mcpToolSegment(name: string): string | null {
  const mcp = name.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/);
  if (!mcp) return null;
  const base = mcp[1];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const FAMILY_META: Record<Exclude<ToolFamily, "mcp">, Omit<ToolTaxonomyEntry, "family">> = {
  terminal: { icon: Terminal, verbLabel: "" },
  grep: { icon: SearchCode, verbLabel: "" },
  search: { icon: Search, verbLabel: "" },
  read: { icon: BookOpen, verbLabel: "" },
  // Board round-4 feedback asked for the terminal glyph on edits as well.
  edit: { icon: Terminal, verbLabel: "" },
  web: { icon: ChevronsLeftRightEllipsis, verbLabel: "" },
  agent: { icon: Network, verbLabel: "" },
  other: { icon: Wrench, verbLabel: "" },
};

const FAMILY_VERB_KEYS: Record<Exclude<ToolFamily, "mcp">, string> = {
  terminal: "commonChatTools.runningCommand",
  grep: "commonChatTools.grepping",
  search: "commonChatTools.searching",
  read: "commonChatTools.readingFiles",
  edit: "commonChatTools.editingFiles",
  web: "commonChatTools.fetchingWeb",
  agent: "commonChatTools.delegating",
  other: "commonChatTools.working",
};

function classify(n: string): Exclude<ToolFamily, "mcp"> {
  // ACP titles are often multi-word ("Read File", "Edit File") — the first
  // word carries the family.
  const first = n.split(/[\s_:-]+/, 1)[0] ?? "";
  if (first === "read" || n === "notebookread") return "read";
  if (first === "edit" || first === "write" || n === "multiedit" || n === "notebookedit") {
    return "edit";
  }
  if (first === "bash" || first === "shell" || first === "run" || n.includes("terminal")) {
    return "terminal";
  }
  // Content grep is its own action (search-code glyph); file-name globbing and
  // generic searches stay under the plain Search family.
  if (first === "grep") return "grep";
  if (first === "glob" || n.includes("search")) return "search";
  if (n.includes("fetch") || n.includes("web") || n.includes("http")) return "web";
  if (first === "task" || first === "agent") return "agent";
  return "other";
}

/** Map a raw tool name to its taxonomy entry; unknown/empty names → Wrench. */
export function toolTaxonomy(name: string | undefined | null): ToolTaxonomyEntry {
  const raw = (name ?? "").trim();
  if (!raw) return { family: "other", ...FAMILY_META.other, verbLabel: t(FAMILY_VERB_KEYS.other) };
  const mcpTool = mcpToolSegment(raw);
  if (mcpTool) return { family: "mcp", icon: McpIcon, verbLabel: t("commonChatTools.usingTool", { tool: mcpTool }) };
  const family = classify(raw.toLowerCase());
  return { family, ...FAMILY_META[family], verbLabel: t(FAMILY_VERB_KEYS[family]) };
}

/**
 * Icons for the tool-free informative statuses ("Thinking", "Responding",
 * "Responding (streaming)"). Whimsified and generic labels get no glyph — the
 * pulse dot alone carries those.
 */
export function statusLabelIcon(label: string | undefined | null): ToolIcon | null {
  const raw = (label ?? "").trim().toLowerCase();
  if (raw === "thinking") return Brain;
  if (raw === "responding" || raw.startsWith("responding (")) return MessageSquareReply;
  return null;
}
