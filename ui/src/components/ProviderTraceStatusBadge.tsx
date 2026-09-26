import { t as tNewUi } from "@/i18n";
import type { ProviderTraceMetadata } from "@paperclipai/shared";
import { Bug, CircleOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function runRequestedProviderTrace(
  contextSnapshot: Record<string, unknown> | null | undefined,
) {
  if (!contextSnapshot) return false;
  const debug = contextSnapshot.debug;
  return (
    typeof debug === "object" &&
    debug !== null &&
    !Array.isArray(debug) &&
    (debug as Record<string, unknown>).providerTrace === "raw"
  );
}

export function ProviderTraceStatusBadge({
  trace,
  requested = false,
  showOff = false,
  className,
}: {
  trace?: ProviderTraceMetadata | null;
  requested?: boolean;
  showOff?: boolean;
  className?: string;
}) {
  const status = trace?.status;
  const expired = trace
    ? new Date(trace.expiresAt).getTime() <= Date.now()
    : false;
  const label = expired
    ? tNewUi("newUi.kc208aa1a887c")
    : status === "capturing"
      ? tNewUi("newUi.k812a3547ae58")
      : status === "complete"
        ? tNewUi("newUi.kc5a0a578f310")
        : status === "incomplete"
          ? tNewUi("newUi.k329116c84b54")
          : status === "truncated"
            ? tNewUi("newUi.k0efe370c05e7")
            : status === "expired"
              ? tNewUi("newUi.kc208aa1a887c")
              : status === "deleted"
                ? tNewUi("newUi.kce1e0dd21642")
                : requested
                  ? tNewUi("newUi.kf1ebbe0e1e0e")
                  : showOff
                    ? tNewUi("newUi.k56a98a226360")
                    : null;
  if (!label) return null;
  const warning =
    status === "incomplete" ||
    status === "truncated" ||
    status === "expired" ||
    status === "deleted" ||
    expired;
  const Icon = label === tNewUi("newUi.k56a98a226360") ? CircleOff : Bug;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
        label === "Trace off" || label === "Trace deleted" || label === "Trace expired"
          ? "border-border bg-background text-muted-foreground"
          : warning
            ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        className,
      )}
      title={
        trace
          ? `${trace.frameCount} frames · ${trace.byteCount} bytes · expires ${new Date(trace.expiresAt).toLocaleString()}`
          : requested
            ? tNewUi("newUi.k4398e38a3b9e")
            : tNewUi("newUi.k90c06cbcbdc3")
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
