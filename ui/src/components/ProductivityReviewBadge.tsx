import { Eye } from "lucide-react";
import type { IssueProductivityReview } from "@paperclipai/shared";
import { Link } from "../lib/router";
import { cn } from "../lib/utils";
import { createIssueDetailPath } from "../lib/issueDetailBreadcrumb";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { t } from "@/i18n";

const TRIGGER_LABELS: Record<string, string> = {
  no_comment_streak: "statusTraining.review.noCommentStreak",
  long_active_duration: "statusTraining.review.longActiveDuration",
  high_churn: "statusTraining.review.highChurn",
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  todo: "statusTraining.review.open",
  in_progress: "statusTraining.review.inProgress",
  in_review: "statusTraining.review.inReview",
  blocked: "statusTraining.review.blocked",
  backlog: "statusTraining.review.open",
};

export function productivityReviewTriggerLabel(
  trigger: IssueProductivityReview["trigger"],
): string {
  if (!trigger) return t("statusTraining.review.title");
  return t(TRIGGER_LABELS[trigger] ?? "statusTraining.review.title");
}

export function ProductivityReviewBadge({
  review,
  className,
  hideLabel = false,
}: {
  review: IssueProductivityReview;
  className?: string;
  hideLabel?: boolean;
}) {
  const label = productivityReviewTriggerLabel(review.trigger);
  const reviewIdentifier = review.reviewIdentifier ?? review.reviewIssueId.slice(0, 8);
  const reviewPath = createIssueDetailPath(review.reviewIdentifier ?? review.reviewIssueId);
  const statusKey = REVIEW_STATUS_LABELS[review.status];
  const statusLabel = statusKey ? t(statusKey) : review.status.replace(/_/g, " ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={reviewPath}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-(length:--text-nano) font-medium text-amber-700 dark:text-amber-300 shrink-0 hover:bg-amber-500/20 transition-colors",
            className,
          )}
          aria-label={t("statusTraining.review.underReviewAria", { reviewIdentifier, label })}
        >
          <Eye className="h-3 w-3" aria-hidden />
          {hideLabel ? null : <span>{t("statusTraining.review.underReview")}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-xs">
          <div className="font-semibold">{t("statusTraining.review.openTitle")}</div>
          <div>
            <span className="text-muted-foreground">{t("statusTraining.review.trigger")}:</span> {label}
          </div>
          {typeof review.noCommentStreak === "number" && review.noCommentStreak > 0 ? (
            <div>
              <span className="text-muted-foreground">{t("statusTraining.review.noCommentStreak")}:</span>{" "}
              {t("statusTraining.review.runs", { count: review.noCommentStreak })}
            </div>
          ) : null}
          <div>
            <span className="text-muted-foreground">{t("statusTraining.review.review")}:</span> {reviewIdentifier} ({statusLabel})
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
