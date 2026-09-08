/**
 * FORK-LOCAL (korean-localization). Not present upstream.
 *
 * Renders a short project code next to an issue identifier. See
 * ui/src/lib/project-code.ts for why the badge exists and how to re-apply it
 * after an upstream merge.
 *
 * Provider-optional by design
 * ---------------------------
 * IssueRow is a leaf presentational component and several of its render paths —
 * including its own test suite — mount it without a QueryClientProvider. Adding
 * a `useQuery` to IssueRow itself therefore broke 19 existing tests with
 * "No QueryClient set". The guard below keeps that contract intact: when no
 * client is in scope the badge silently renders nothing, so no existing caller
 * has to change. Only one hook runs before the early return, and the presence of
 * a provider never changes for a given mount, so the hook order stays stable.
 */
import { useContext } from "react";
import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { projectsApi } from "@/api";
import { queryKeys } from "@/lib/queryKeys";
import { buildProjectCodeMap } from "@/lib/project-code";
import { Badge } from "@/components/ui/badge";

const PROJECT_CODE_STALE_TIME_MS = 5 * 60 * 1000;

interface ProjectCodeBadgeProps {
  companyId: string | null | undefined;
  projectId: string | null | undefined;
  /** Hides the badge below the `sm` breakpoint, matching the row's other meta. */
  className?: string;
}

function ProjectCodeBadgeInner({ companyId, projectId, className }: ProjectCodeBadgeProps) {
  // Reuses the exact key the sidebar and the mention picker already populate,
  // so a board full of rows costs no extra request.
  const { data } = useQuery({
    queryKey: queryKeys.projects.list(companyId!),
    queryFn: () => projectsApi.list(companyId!),
    staleTime: PROJECT_CODE_STALE_TIME_MS,
  });
  const entry = projectId ? buildProjectCodeMap(data).get(projectId) : undefined;
  if (!entry) return null;
  return (
    <Badge
      variant="outline"
      data-testid="issue-row-project-code"
      title={entry.name}
      className={className}
    >
      {entry.code}
    </Badge>
  );
}

export function ProjectCodeBadge(props: ProjectCodeBadgeProps) {
  const queryClient = useContext(QueryClientContext);
  if (!queryClient || !props.companyId || !props.projectId) return null;
  return <ProjectCodeBadgeInner {...props} />;
}
