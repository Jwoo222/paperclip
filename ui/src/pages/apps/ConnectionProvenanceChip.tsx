import { t as tNewUi } from "@/i18n";
import { Blocks } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConnectionProvenanceChip({
  connection,
  className,
}: {
  connection: {
    config?: Record<string, unknown> | null;
    credentialSource?: string;
    externalCredential?: { connectorUid?: string } | null;
  } | null | undefined;
  className?: string;
}) {
  const chipClass = cn(
    "inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
    className,
  );
  if (connection?.credentialSource === "vercel_connect") {
    const connectorUid = connection.externalCredential?.connectorUid;
    return (
      <span
        className={chipClass}
        title={connectorUid ? `Credentials managed by Vercel Connect (${connectorUid})` : tNewUi("newUi.k25308b6d7fac")}
      >
        <Blocks className="h-3 w-3" />
        {tNewUi("newUi.kd34e03fbdfb4")}
      </span>
    );
  }

  return null;
}
