import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GITHUB_REVIEW_EVENTS,
  type GitHubChatConfiguration,
  type GitHubReviewPolicy,
  type GitHubAllowedPerson,
} from "@paperclipai/shared";
import { accessApi } from "@/api/access";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { githubChatApi } from "@/api/githubChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Link } from "@/lib/router";

export const githubSelectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const eventLabels = {
  opened: tNewUi("newUi.k263c7984dc78"),
  synchronize: tNewUi("newUi.k30b31318a7e1"),
  reopened: tNewUi("newUi.k53a4ae1c597a"),
  ready_for_review: tNewUi("newUi.k75c2a5c81da1"),
  mention: tNewUi("newUi.kd820d8de70e4"),
  comment: "Follow-up comment",
};
export function GitHubToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <ToggleSwitch
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}
export function GitHubPolicyEditor({
  policy,
  onChange,
}: {
  policy: GitHubReviewPolicy;
  onChange: (policy: GitHubReviewPolicy) => void;
}) {
  const [prompt, setPrompt] =
    useState<(typeof GITHUB_REVIEW_EVENTS)[number]>("opened");
  const set = <K extends keyof GitHubReviewPolicy>(
    key: K,
    value: GitHubReviewPolicy[K],
  ) => onChange({ ...policy, [key]: value });
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="github-invocation">
          {tNewUi("newUi.ke10e8e099769")}
        </Label>
        <select
          id="github-invocation"
          className={githubSelectClass}
          value={policy.invocation}
          onChange={(e) =>
            set(
              "invocation",
              e.target.value as GitHubReviewPolicy["invocation"],
            )
          }
        >
          <option value="linked_authors">
            {tNewUi("newUi.keb44de807528")}
          </option>
          <option value="mentions_only">{tNewUi("newUi.k3d0d0ce4102a")}</option>
          <option value="allowed_authors">
            {tNewUi("newUi.k97449943327a")}
          </option>
        </select>
        <p className="text-xs text-muted-foreground">
          {tNewUi("newUi.kf329c97f7333")}
        </p>
      </div>
      <div>
        <h3 className="text-sm font-medium">{tNewUi("newUi.k7edf33aef2af")}</h3>
        {GITHUB_REVIEW_EVENTS.slice(0, 4).map((event) => (
          <GitHubToggle
            key={event}
            label={eventLabels[event]}
            checked={policy.events.includes(event)}
            onChange={(enabled) =>
              set(
                "events",
                enabled
                  ? [...new Set([...policy.events, event])]
                  : policy.events.filter((value) => value !== event),
              )
            }
          />
        ))}
        <GitHubToggle
          label={tNewUi("newUi.k433fa0da3bc9")}
          checked={policy.reviewDrafts}
          onChange={(value) => set("reviewDrafts", value)}
        />
        <GitHubToggle
          label={tNewUi("newUi.k1d32654778c8")}
          description={tNewUi("newUi.k7231d929dee5")}
          checked={policy.reviewBotAuthors}
          onChange={(value) => set("reviewBotAuthors", value)}
        />
      </div>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          {tNewUi("newUi.ka7d25ebdff16")}
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              [
                "includeAuthors",
                tNewUi("newUi.k9bdcd930abe0"),
                tNewUi("newUi.k4f4ddaa8e929"),
              ],
              [
                "excludeAuthors",
                tNewUi("newUi.kc17489a24bcf"),
                tNewUi("newUi.k474974839a1b"),
              ],
              [
                "targetBranches",
                tNewUi("newUi.kfc76f6bfb754"),
                tNewUi("newUi.kec44fc49cbad"),
              ],
              [
                "excludedBranches",
                tNewUi("newUi.k3dcfbf833177"),
                tNewUi("newUi.k13b0dfa8d125"),
              ],
              [
                "requiredLabels",
                tNewUi("newUi.k72ca62fb3cf8"),
                tNewUi("newUi.k22e3284b6a80"),
              ],
              [
                "excludedLabels",
                tNewUi("newUi.k2ca622768334"),
                tNewUi("newUi.k213371c68ba7"),
              ],
              [
                "ignoredPaths",
                tNewUi("newUi.k401dac866eb3"),
                tNewUi("newUi.kace040896367"),
              ],
            ] as const
          ).map(([key, label, help]) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`github-${key}`}>{label}</Label>
              <Textarea
                id={`github-${key}`}
                value={policy[key].join("\n")}
                onChange={(e) =>
                  set(key, e.target.value.split("\n").filter(Boolean))
                }
              />
              <p className="text-xs text-muted-foreground">{help}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {tNewUi("newUi.kc4b12a58033a")}
        </p>
      </details>
      <div className="space-y-2">
        <Label htmlFor="github-instructions">{tNewUi("newUi.ke61fbd9695a5")}</Label>
        <Textarea
          id="github-instructions"
          value={policy.instructions}
          onChange={(e) => set("instructions", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {tNewUi("newUi.k2067b3b77ee2")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-prompt-event">{tNewUi("newUi.kd3e623f3c821")}</Label>
        <select
          id="github-prompt-event"
          className={githubSelectClass}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value as typeof prompt)}
        >
          {GITHUB_REVIEW_EVENTS.map((event) => (
            <option key={event} value={event}>
              {eventLabels[event]}
            </option>
          ))}
        </select>
        <Textarea
          aria-label={`${eventLabels[prompt]} prompt`}
          value={policy.prompts[prompt]}
          onChange={(e) =>
            set("prompts", { ...policy.prompts, [prompt]: e.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">
          {tNewUi("newUi.k5a0f2089e322")}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="github-categories">{tNewUi("newUi.k6f31e9d6dcf7")}</Label>
          <Input
            id="github-categories"
            value={policy.findingCategories.join(", ")}
            onChange={(e) =>
              set(
                "findingCategories",
                e.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              )
            }
          />
          <p className="text-xs text-muted-foreground">
            {tNewUi("newUi.kca9a3f176330")}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="github-severity">
            {tNewUi("newUi.kd20fbcf4930b")}
          </Label>
          <select
            id="github-severity"
            className={githubSelectClass}
            value={policy.minimumCommentSeverity}
            onChange={(e) =>
              set(
                "minimumCommentSeverity",
                e.target.value as GitHubReviewPolicy["minimumCommentSeverity"],
              )
            }
          >
            <option value="info">{tNewUi("newUi.k170322a32f3c")}</option>
            <option value="warning">{tNewUi("newUi.ke981ddae45d8")}</option>
            <option value="error">{t("resourceStatus.error")}</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {tNewUi("newUi.k42ac3ca435e4")}
          </p>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium">{tNewUi("newUi.k24669fa324b5")}</h3>
        <GitHubToggle
          label={tNewUi("newUi.ke1d31b27d14f")}
          checked={policy.publishSummary}
          onChange={(value) => set("publishSummary", value)}
        />
        <GitHubToggle
          label={tNewUi("newUi.kd2558312993a")}
          checked={policy.publishInline}
          onChange={(value) => set("publishInline", value)}
        />
        <GitHubToggle
          label={tNewUi("newUi.k22261e40bbee")}
          description={tNewUi("newUi.k329a945b6a9f")}
          checked={policy.allowApprove}
          onChange={(value) => set("allowApprove", value)}
        />
        <GitHubToggle
          label={tNewUi("newUi.kd5b9658cc639")}
          checked={policy.allowRequestChanges}
          onChange={(value) => set("allowRequestChanges", value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-rating">{tNewUi("newUi.k5cfccfdcf6a3")}</Label>
        <select
          id="github-rating"
          className={githubSelectClass}
          value={policy.ratingThreshold ?? "report"}
          onChange={(e) =>
            set(
              "ratingThreshold",
              e.target.value === "report"
                ? null
                : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5),
            )
          }
        >
          {[5, 4, 3, 2, 1].map((score) => (
            <option key={score} value={score}>
              {tNewUi("newUi.kd5cad1769f23")} {score}/5
            </option>
          ))}
          <option value="report">{tNewUi("newUi.k5d49741265be")}</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {tNewUi("newUi.keac35a02c11e")}
        </p>
        <a
          className="text-xs underline"
          href="https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository"
          target="_blank"
          rel="noreferrer"
        >
          {tNewUi("newUi.k91663fc21f26")}
        </a>
      </div>
    </div>
  );
}

export function GitHubAccessEditor({
  endpointId,
  companyId,
  configuration,
  onChange,
}: {
  endpointId: string;
  companyId: string;
  configuration: GitHubChatConfiguration;
  onChange: (configuration: GitHubChatConfiguration) => void;
}) {
  const accountLink = useRef<HTMLAnchorElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const members = useQuery({
    queryKey: ["github-members", companyId],
    queryFn: () => accessApi.listMembers(companyId),
  });
  const links = useQuery({
    queryKey: ["github-linked-members", endpointId],
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
  });
  const [kind, setKind] = useState<"member" | "guest" | null>(null);
  const [login, setLogin] = useState("");
  const [sponsor, setSponsor] = useState(configuration.responsibleUserId);
  const [candidate, setCandidate] = useState<{
    githubUserId: string;
    login: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const add = (person: GitHubAllowedPerson) => {
    if (
      configuration.people.some((p) => p.githubUserId === person.githubUserId)
    )
      return;
    onChange({
      ...configuration,
      ...(person.kind === "member" ? { memberAccess: "selected" } : {}),
      people: [...configuration.people, person],
    });
    setKind(null);
    setCandidate(null);
    setLogin("");
  };
  const activeMembers = (members.data?.members ?? []).filter(
    (member) =>
      member.status === "active" && member.membershipRole !== "viewer",
  );
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="github-responsible">
          {tNewUi("newUi.k8c627ece07af")}
        </Label>
        <select
          id="github-responsible"
          className={githubSelectClass}
          value={configuration.responsibleUserId}
          onChange={(e) =>
            onChange({ ...configuration, responsibleUserId: e.target.value })
          }
        >
          {activeMembers.map((member) => (
            <option key={member.principalId} value={member.principalId}>
              {member.user?.name ?? member.user?.email ?? member.principalId}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {tNewUi("newUi.k0b2f90a8fd9c")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-member-access">{tNewUi("newUi.k2a721252cde0")}</Label>
        <select
          id="github-member-access"
          className={githubSelectClass}
          value={configuration.memberAccess}
          onChange={(e) =>
            onChange({
              ...configuration,
              memberAccess: e.target.value as "all_linked" | "selected",
            })
          }
        >
          <option value="all_linked">{tNewUi("newUi.kc4f6d738f5e5")}</option>
          <option value="selected">{tNewUi("newUi.kc749e6e75ca2")}</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {tNewUi("newUi.k95eaa9c7dcac")}{" "}
          <Link
            className="underline"
            ref={accountLink}
            to={`/apps/chat/connect?provider=github&resume=${endpointId}&stage=identity`}
          >
            {tNewUi("newUi.k9218eed43e94")}
          </Link>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              if (accountLink.current)
                void copyTextToClipboard(accountLink.current.href).then(
                  () => setLinkCopied(true),
                  () =>
                    setError(
                      tNewUi("newUi.ke3f2cbe8526c"),
                    ),
                );
            }}
          >
            {linkCopied ? tNewUi("newUi.kd12860c21e78") : tNewUi("newUi.k272c02876024")}
          </Button>
          .
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{tNewUi("newUi.k5d7ade44d7fa")}</h3>
        {links.isError && (
          <p role="alert" className="text-sm text-destructive">
            {tNewUi("newUi.kc1b59db6862a")}
          </p>
        )}
        {(links.data ?? [])
          .filter((link) => link.status === "linked")
          .map((link) => (
            <div
              key={link.principalId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <p className="text-sm">
                @{link.githubLogin ?? link.externalLabel}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await chatEndpointsApi.revokeLink(
                      endpointId,
                      link.principalId,
                    );
                    await links.refetch();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : tNewUi("newUi.k445e5a10c59c"),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {tNewUi("newUi.kf3f145c6a98e")}
              </Button>
            </div>
          ))}
        {!links.isPending &&
          !links.isError &&
          !(links.data ?? []).some((link) => link.status === "linked") && (
            <p className="text-sm text-muted-foreground">
              {tNewUi("newUi.kfe6757cd621a")}
            </p>
          )}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {configuration.people.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {tNewUi("newUi.k3c2180d8bdaf")}
          </p>
        )}
        {configuration.people.map((person) => (
          <div key={person.githubUserId} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">@{person.login}</p>
                <p className="text-xs text-muted-foreground">
                  {person.kind === "member"
                    ? tNewUi("newUi.ka8583eb599e0")
                    : tNewUi("newUi.k3de380bb3794")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...configuration,
                    people: configuration.people.filter(
                      (p) => p.githubUserId !== person.githubUserId,
                    ),
                  })
                }
              >
                {tNewUi("newUi.kc3812fc4acb8")}
              </Button>
            </div>
            <GitHubToggle
              label={`Automatic PR reviews for @${person.login}`}
              checked={person.automaticReviews}
              onChange={(value) =>
                onChange({
                  ...configuration,
                  people: configuration.people.map((p) =>
                    p.githubUserId === person.githubUserId
                      ? { ...p, automaticReviews: value }
                      : p,
                  ),
                })
              }
            />
            {person.kind === "guest" && (
              <p className="text-xs text-muted-foreground">
                {tNewUi("newUi.k79d0c211e09f")}{" "}
                {activeMembers.find(
                  (member) => member.principalId === person.sponsorUserId,
                )?.user?.name ?? person.sponsorUserId}
                {tNewUi("newUi.k8c0bbf8e450a")}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setKind("member")}>
          {tNewUi("newUi.k0c1b3674e054")}
        </Button>
        <Button variant="outline" onClick={() => setKind("guest")}>
          {tNewUi("newUi.kfea8e4f5b2d7")}
        </Button>
      </div>
      {kind === "member" && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            {tNewUi("newUi.k530ff09e84bf")}
          </p>
          {(links.data ?? [])
            .filter((link) => link.status === "linked" && link.paperclipUserId)
            .map((link) => (
              <Button
                className="mr-2"
                key={link.id}
                variant="outline"
                disabled={configuration.people.some(
                  (p) =>
                    p.kind === "member" && p.userId === link.paperclipUserId,
                )}
                onClick={() => {
                  const id = link.githubUserId;
                  if (!id) {
                    setError(
                      tNewUi("newUi.k90c0958be9c9"),
                    );
                    return;
                  }
                  add({
                    kind: "member",
                    userId: link.paperclipUserId!,
                    githubUserId: id,
                    login: link.githubLogin ?? link.externalLabel,
                    automaticReviews: false,
                  });
                }}
              >
                {link.paperclipUserLabel ?? link.externalLabel}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setKind(null)}>
            {t("taskDetail.cancel")}
          </Button>
        </div>
      )}
      {kind === "guest" && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="text-sm">
            {tNewUi("newUi.k63030a7c1899")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="github-guest-login">{tNewUi("newUi.k64477e38cfb5")}</Label>
            <div className="flex gap-2">
              <Input
                id="github-guest-login"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setCandidate(null);
                }}
              />
              <Button
                variant="outline"
                disabled={busy || !login}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    setCandidate(await githubChatApi.lookup(endpointId, login));
                  } catch (error) {
                    setError(
                      error instanceof Error ? error.message : tNewUi("newUi.ka8a25eeb73a1"),
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {tNewUi("newUi.k504101bcda9e")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-guest-sponsor">{tNewUi("newUi.kfd6e874f43f8")}</Label>
            <select
              id="github-guest-sponsor"
              className={githubSelectClass}
              value={sponsor}
              onChange={(e) => setSponsor(e.target.value)}
            >
              {activeMembers.map((member) => (
                <option key={member.principalId} value={member.principalId}>
                  {member.user?.name ?? member.principalId}
                </option>
              ))}
            </select>
          </div>
          {candidate && (
            <p className="text-sm">
              @{candidate.login} {tNewUi("newUi.kd614c4e47181")} {candidate.githubUserId}
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setKind(null)}>
              {t("taskDetail.cancel")}
            </Button>
            <Button
              disabled={
                !candidate ||
                !sponsor ||
                configuration.people.some(
                  (p) => p.githubUserId === candidate.githubUserId,
                )
              }
              onClick={() =>
                candidate &&
                add({
                  ...candidate,
                  kind: "guest",
                  sponsorUserId: sponsor,
                  permissionProfile: "restricted",
                  automaticReviews: false,
                })
              }
            >
              {tNewUi("newUi.k0c44f8da961b")}
            </Button>
          </div>
        </div>
      )}
      {(error || members.error || links.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ||
            tNewUi("newUi.ked5ce86d7c54")}
        </p>
      )}
    </div>
  );
}
