import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { brandChipBadge, type BrandChipColor } from "@/lib/status-colors";

/**
 * The load-bearing visual grammar for the built-in bundle status panel
 * (Reflection Coach — [PAP-13099], ux-spec §4). Each variant double-encodes
 * state as glyph + word + color so it never relies on color alone
 * (WCAG 1.4.1). Colors route through the shared `brandChipBadge` families — no
 * bespoke tints are minted here (ux-spec §10).
 *
 * A single resource shows at most one readiness chip and at most one drift
 * chip; when both a readiness problem and a drift state coexist, the caller
 * suppresses the drift chip until readiness is `ready` (ux-spec §4).
 */
export type ResourceStatusVariant =
  | "ready"
  | "needs_setup"
  | "missing"
  | "error"
  | "update_available"
  | "drifted"
  | "schedule_off"
  | "schedule_on"
  | "pending_approval"
  | "proposal_pending";

interface VariantSpec {
  color: BrandChipColor;
  glyph: string;
  labelKey: string;
  titleKey: string;
}

const VARIANTS: Record<ResourceStatusVariant, VariantSpec> = {
  ready: { color: "green", glyph: "●", labelKey: "ready", titleKey: "readyHelp" },
  needs_setup: { color: "amber", glyph: "⚠", labelKey: "needsSetup", titleKey: "needsSetupHelp" },
  missing: { color: "amber", glyph: "⚠", labelKey: "missing", titleKey: "missingHelp" },
  error: { color: "red", glyph: "✕", labelKey: "error", titleKey: "errorHelp" },
  update_available: {
    color: "blue",
    glyph: "↑",
    labelKey: "updateAvailable",
    titleKey: "updateAvailableHelp",
  },
  drifted: {
    color: "gray",
    glyph: "✎",
    labelKey: "drifted",
    titleKey: "driftedHelp",
  },
  schedule_off: {
    color: "gray",
    glyph: "◌",
    labelKey: "scheduleOff",
    titleKey: "scheduleOffHelp",
  },
  schedule_on: { color: "green", glyph: "●", labelKey: "weekly", titleKey: "weeklyHelp" },
  pending_approval: {
    color: "amber",
    glyph: "⚠",
    labelKey: "pendingApproval",
    titleKey: "pendingApprovalHelp",
  },
  proposal_pending: {
    color: "blue",
    glyph: "↑",
    labelKey: "proposalPending",
    titleKey: "proposalPendingHelp",
  },
};

export function ResourceStatusChip({
  variant,
  label,
  compact = false,
  className,
}: {
  variant: ResourceStatusVariant;
  /** Override the default label (e.g. "Weekly · Mon 09:00 UTC"). */
  label?: string;
  compact?: boolean;
  className?: string;
}) {
  const spec = VARIANTS[variant];
  return (
    <Badge
      variant="outline"
      className={cn(
        brandChipBadge[spec.color],
        "font-medium",
        compact && "px-1.5 py-0 text-(length:--text-nano)",
        className,
      )}
      title={t(`resourceStatus.${spec.titleKey}`)}
    >
      <span aria-hidden="true">{spec.glyph}</span>
      {label ?? t(`resourceStatus.${spec.labelKey}`)}
    </Badge>
  );
}
