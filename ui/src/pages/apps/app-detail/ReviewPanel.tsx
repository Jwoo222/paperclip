import { ReviewQueueCard } from "../ReviewQueueCard";
import { QuarantinedActionsReview } from "./SetupPanel";
import type { AppDetailSectionProps } from "./types";
import { t } from "@/i18n";

export function ReviewPanel({
  connectionId,
  quarantined = [],
  pending = false,
  onReviewQuarantined,
}: Pick<AppDetailSectionProps, "connectionId"> &
  Partial<Pick<AppDetailSectionProps, "quarantined" | "pending">> & {
    onReviewQuarantined?: (enabledIds: string[]) => void;
  }) {
  const showsQuarantinedActions = quarantined.length > 0 && !!onReviewQuarantined;

  return (
    <div className="space-y-4">
      {showsQuarantinedActions ? (
        <QuarantinedActionsReview
          entries={quarantined}
          disabled={pending}
          onSubmit={onReviewQuarantined}
        />
      ) : null}
      <ReviewQueueCard
        connectionId={connectionId}
        heading={t("appDetail.review.waitingForApproval")}
        emptyState={showsQuarantinedActions ? "hidden" : "reassure"}
      />
    </div>
  );
}
