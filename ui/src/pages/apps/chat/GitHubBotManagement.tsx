import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { GitHubChatConfiguration } from "@paperclipai/shared";
import {
  githubChatApi,
  type GitHubConfigurationRecord,
} from "@/api/githubChat";
import { chatEndpointsApi, type ChatEndpoint } from "@/api/chatEndpoints";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import { formatDateTime } from "@/lib/utils";
import {
  GitHubAccessEditor,
  GitHubPolicyEditor,
  GitHubToggle,
  githubSelectClass,
} from "./GitHubBotConfiguration";

export function GitHubBotManagement({
  endpoint,
  view,
}: {
  endpoint: ChatEndpoint;
  view: "settings" | "access";
}) {
  const query = useQuery({
    queryKey: ["github-bot-configuration", endpoint.id],
    queryFn: () => githubChatApi.configuration(endpoint.id),
  });
  const resources = useQuery({
    queryKey: ["github-bot-repositories", endpoint.id],
    queryFn: () => chatEndpointsApi.listResources(endpoint.id),
  });
  const [draft, setDraft] = useState<GitHubConfigurationRecord | null>(null);
  const [repository, setRepository] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const record = draft ?? query.data;
  const edit = (configuration: GitHubChatConfiguration) => {
    if (record) setDraft({ ...record, configuration });
    setNotice("");
  };
  const act = async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : tNewUi("newUi.ka1b18c56f151"));
    } finally {
      setPending(false);
    }
  };
  if (query.isError || resources.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {tNewUi("newUi.k520186526fb3")}{" "}
        <Button
          variant="link"
          onClick={() => {
            void query.refetch();
            void resources.refetch();
          }}
        >
          {tNewUi("newUi.kd8b8392e2c54")}
        </Button>
      </p>
    );
  if (!record)
    return (
      <p className="text-sm text-muted-foreground">{tNewUi("newUi.kbc8fd86dcffd")}</p>
    );
  const config = record.configuration;
  const override = repository ? config.repositories[repository] : undefined;
  return (
    <section className="max-w-3xl space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          {view === "access"
            ? tNewUi("newUi.ka4285ffa01bd")
            : tNewUi("newUi.k3a5d8a8c669c")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {endpoint.assignedAgentName} {tNewUi("newUi.ke7c7a0b30a27")}
        </p>
        <Link
          className="text-sm underline"
          to={`/apps/${endpoint.connectionId}`}
        >
          {tNewUi("newUi.kef3e4ed59500")}
        </Link>
      </div>
      {view === "access" ? (
        <GitHubAccessEditor
          endpointId={endpoint.id}
          companyId={endpoint.companyId}
          configuration={config}
          onChange={edit}
        />
      ) : (
        <>
          <GitHubToggle
            label={tNewUi("newUi.k48a207abaa96")}
            description={tNewUi("newUi.k64035f24ab8a")}
            checked={config.toolsEnabled}
            onChange={(toolsEnabled) => edit({ ...config, toolsEnabled })}
          />
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-medium">{tNewUi("newUi.k3e3d7edf97ee")}</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    void act(async () => {
                      await githubChatApi.refreshRepositories(endpoint.id);
                      await resources.refetch();
                      setNotice(
                        tNewUi("newUi.k1b9f7156a5e7"),
                      );
                    })
                  }
                >
                  <RefreshCw className="size-4" />
                  {tNewUi("newUi.k0e9161011702")}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={
                      endpoint.setup?.github?.managementUrl ??
                      endpoint.setup?.github?.installationUrl ??
                      "https://github.com/settings/installations"
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tNewUi("newUi.k106d34427770")}
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {tNewUi("newUi.k2e1191e8d80d")}
            </p>
            {resources.data
              ?.filter((r) => r.type === "repository")
              .map((resource) => (
                <GitHubToggle
                  key={resource.id}
                  label={resource.label ?? resource.providerResourceId}
                  description={
                    resource.availability === "available"
                      ? undefined
                      : tNewUi("newUi.kbca11134d2de")
                  }
                  checked={resource.enabled}
                  onChange={(enabled) =>
                    void act(async () => {
                      await chatEndpointsApi.updateResources(endpoint.id, [
                        { id: resource.id, enabled },
                      ]);
                      await resources.refetch();
                    })
                  }
                />
              ))}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="github-policy-repository"
              className="text-sm font-medium"
            >
              {tNewUi("newUi.kda791254e00e")}
            </label>
            <select
              id="github-policy-repository"
              className={githubSelectClass}
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
            >
              <option value="">{tNewUi("newUi.kef6250a55128")}</option>
              {resources.data
                ?.filter(
                  (r) =>
                    r.type === "repository" &&
                    r.enabled &&
                    r.metadata?.providerRepositoryId,
                )
                .map((r) => (
                  <option
                    key={r.id}
                    value={String(r.metadata?.providerRepositoryId)}
                  >
                    {r.label ?? r.providerResourceId}
                  </option>
                ))}
            </select>
          </div>
          {repository && (
            <GitHubToggle
              label={tNewUi("newUi.kfa09d2e2b04e")}
              description={tNewUi("newUi.kd31e5099c792")}
              checked={!!override}
              onChange={(enabled) => {
                const repositories = { ...config.repositories };
                if (enabled) repositories[repository] = { ...config.defaults };
                else delete repositories[repository];
                edit({ ...config, repositories });
              }}
            />
          )}
          {!repository || override ? (
            <GitHubPolicyEditor
              policy={{ ...config.defaults, ...override }}
              onChange={(policy) =>
                edit(
                  repository
                    ? {
                        ...config,
                        repositories: {
                          ...config.repositories,
                          [repository]: policy,
                        },
                      }
                    : { ...config, defaults: policy },
                )
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {tNewUi("newUi.kd0a794abc92a")}
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          variant="ghost"
          disabled={!draft || pending}
          onClick={() => {
            setDraft(null);
            setError("");
          }}
        >
          {t("routinesExtra.general.discard")}
        </Button>
        <Button
          disabled={!draft || pending}
          onClick={() =>
            void act(async () => {
              const saved = await githubChatApi.save(
                endpoint.id,
                record.revision,
                config,
              );
              setDraft(saved);
              await query.refetch();
              setDraft(null);
              setNotice(tNewUi("newUi.k6b5b3c69e02d"));
            })
          }
        >
          {pending ? "Saving…" : tNewUi("newUi.kdd0ae7a5cbcf")}
        </Button>
      </div>
    </section>
  );
}

export function GitHubReviews({ endpointId }: { endpointId: string }) {
  const query = useQuery({
    queryKey: ["github-bot-reviews", endpointId],
    queryFn: () => githubChatApi.reviews(endpointId),
    refetchInterval: 5000,
  });
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{tNewUi("newUi.k84cb7871b741")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tNewUi("newUi.kbb8c8faa9fdf")}
        </p>
      </div>
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {tNewUi("newUi.k58b6d1547d53")}{" "}
          <Button variant="link" onClick={() => void query.refetch()}>
            {tNewUi("newUi.kd8b8392e2c54")}
          </Button>
        </p>
      )}
      {query.isLoading && (
        <p className="text-sm text-muted-foreground">{tNewUi("newUi.k510c765f211f")}</p>
      )}
      {query.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {tNewUi("newUi.k52d01638be45")}
        </p>
      )}
      {query.data?.map((review) => (
        <article
          key={review.id}
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <a
              className="text-sm font-medium underline"
              href={`https://github.com/${review.repository}/pull/${review.pullNumber}`}
              target="_blank"
              rel="noreferrer"
            >
              {review.repository} #{review.pullNumber}
            </a>
            <span className="text-sm">
              {review.assessment?.complete
                ? `${review.assessment.score}/5`
                : review.state.replaceAll("_", " ")}{" "}
              ·{" "}
              {review.conclusion?.replaceAll("_", " ") ?? tNewUi("newUi.k53000e1b1134")}
            </span>
          </div>
          <p className="text-sm">
            {review.assessment?.summary ?? review.event.title}
          </p>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <code>{review.headSha.slice(0, 12)}</code>
            <span>{formatDateTime(review.updatedAt)}</span>
            <Link className="underline" to={`/issues/${review.issueId}`}>
              {tNewUi("newUi.kff44b378e15c")}
            </Link>
            {review.runId && (
              <Link
                className="underline"
                to={`/issues/${review.issueId}?runId=${review.runId}`}
              >
                {tNewUi("newUi.k00d60e31a4e6")}
              </Link>
            )}
            {review.summaryUrl && (
              <a
                className="underline"
                href={review.summaryUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("pipelinesResidualExtra.deliverableSummary")}
              </a>
            )}
            {review.checkUrl && (
              <a
                className="underline"
                href={review.checkUrl}
                target="_blank"
                rel="noreferrer"
              >
                {tNewUi("newUi.k9d60841e0a78")}
              </a>
            )}
          </div>
          {review.assessment && (
            <details className="text-sm">
              <summary className="cursor-pointer">
                {tNewUi("newUi.k439aa4e2b74a")}
              </summary>
              <p className="mt-2">{review.assessment.rationale}</p>
              <p className="mt-2 text-muted-foreground">
                {review.assessment.coverage.reviewedPaths.length} {tNewUi("newUi.k4bcaed702a56")} {review.assessment.coverage.omittedPaths.length} {tNewUi("newUi.kf34912a1d0fc")}
              </p>
              {review.assessment.coverage.limitations.map((limit, index) => (
                <p key={index} className="mt-1 text-muted-foreground">
                  {limit}
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
