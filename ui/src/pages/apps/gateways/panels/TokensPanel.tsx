import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus } from "lucide-react";
import type {
  ToolMcpGatewayTokenAction,
  ToolMcpGatewayTokenCreated,
  ToolMcpGatewayWithTokens,
} from "@paperclipai/shared";
import { toolsApi } from "@/api/tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";
import { RelativeTime } from "@/pages/tools/shared";
import { cn } from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/clipboard";
import { gatewaysQueryKey } from "../NewGatewayDialog";
import { maskedTokenLabel, TOKEN_STATUS_LABEL, tokenStatus, type TokenStatus } from "../gateway-helpers";
import { useTranslation } from "@/i18n";

const DEFAULT_ACTIONS: ToolMcpGatewayTokenAction[] = ["tools/list", "tools/call"];

function defaultExpiry(): string {
  return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const STATUS_CLASS: Record<TokenStatus, string> = {
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expiring: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  expired: "border-border bg-muted text-muted-foreground",
  revoked: "border-foreground bg-foreground text-background",
};

/** Token status pill, shared by the desktop table and mobile cards. */
function StatusBadge({ status }: { status: TokenStatus }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        STATUS_CLASS[status],
      )}
    >
      {status === "active" ? t("appsBrowserGateway.gateway.active") : TOKEN_STATUS_LABEL[status]}
    </span>
  );
}

/** One label:value pair inside a mobile stacked card. */
function TokenField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-foreground">{value}</dd>
    </div>
  );
}

export function TokensPanel({
  companyId,
  gateway,
  onTokenCreated,
}: {
  companyId: string;
  gateway: ToolMcpGatewayWithTokens;
  onTokenCreated?: (token: ToolMcpGatewayTokenCreated) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [minting, setMinting] = useState(false);
  const [name, setName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [ownerNote, setOwnerNote] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiry());
  const [created, setCreated] = useState<ToolMcpGatewayTokenCreated | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [revokeName, setRevokeName] = useState("");
  const [confirmToken, setConfirmToken] = useState<{ id: string; name: string } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: gatewaysQueryKey(companyId) });

  const createMutation = useMutation({
    mutationFn: () =>
      toolsApi.createGatewayToken(companyId, gateway.id, {
        name: name.trim(),
        clientLabel: clientLabel.trim() || name.trim(),
        ownerNote: ownerNote.trim() || name.trim(),
        allowedActions: DEFAULT_ACTIONS,
        expiresAt: expiresAt ? `${expiresAt}T23:59:59.000Z` : null,
      }),
    onSuccess: async (token) => {
      setCreated(token);
      setRevealed(true);
      setMinting(false);
      setName("");
      setClientLabel("");
      setOwnerNote("");
      setExpiresAt(defaultExpiry());
      pushToast({
        title: t("appsBrowserGateway.gateway.tokens.minted"),
        body: t("appsBrowserGateway.gateway.tokens.mintedBody"),
        tone: "success",
      });
      onTokenCreated?.(token);
      await invalidate();
    },
    onError: (error) =>
      pushToast({
        title: t("appsBrowserGateway.gateway.tokens.mintFailed"),
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      }),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => toolsApi.revokeGatewayToken(companyId, tokenId),
    onSuccess: async (token) => {
      setConfirmToken(null);
      setRevokeName("");
      pushToast({ title: t("appsBrowserGateway.gateway.tokens.revoked"), body: t("appsBrowserGateway.gateway.tokens.revokedBody", { name: token.name }), tone: "success" });
      await invalidate();
    },
    onError: (error) =>
      pushToast({
        title: t("appsBrowserGateway.gateway.tokens.revokeFailed"),
        body: error instanceof Error ? error.message : String(error),
        tone: "error",
      }),
  });

  async function copyToken(value: string) {
    try {
      await copyTextToClipboard(value);
      pushToast({ title: t("appsBrowserGateway.gateway.copied"), body: t("appsBrowserGateway.gateway.tokens.accessToken"), tone: "success" });
    } catch (error) {
      pushToast({
        title: t("appsBrowserGateway.gateway.copyFailed"),
        body: error instanceof Error ? error.message : t("appsBrowserGateway.gateway.clipboardUnavailable"),
        tone: "error",
      });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  const tokens = useMemo(
    () =>
      [...gateway.tokens].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [gateway.tokens],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("appsBrowserGateway.gateway.tokens.description")}
        </p>
        <Button size="sm" onClick={() => setMinting((value) => !value)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("appsBrowserGateway.gateway.tokens.mint")}
        </Button>
      </div>

      {minting ? (
        <form className="space-y-3 rounded-md border border-border p-4" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t("appsBrowserGateway.gateway.tokens.name")}</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cto-cursor" required autoFocus />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t("appsBrowserGateway.gateway.tokens.owner")}</span>
              <Input
                value={clientLabel}
                onChange={(e) => setClientLabel(e.target.value)}
                placeholder="Cursor on work laptop"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t("appsBrowserGateway.gateway.tokens.note")}</span>
              <Input value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} placeholder="Dotta’s MacBook" />
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{t("appsBrowserGateway.gateway.tokens.expires")}</span>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setMinting(false)}>
              {t("appsBrowserGateway.connections.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending || !name.trim()}>
              {createMutation.isPending ? t("appsBrowserGateway.gateway.tokens.minting") : t("appsBrowserGateway.gateway.tokens.mint")}
            </Button>
          </div>
        </form>
      ) : null}

      {created ? (
        <div className="space-y-2 rounded-md border-2 border-foreground/80 bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">{t("appsBrowserGateway.gateway.tokens.created")}</div>
              <div className="text-xs text-muted-foreground">
                {t("appsBrowserGateway.gateway.tokens.createdBody")}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setCreated(null)} aria-label={t("appsBrowserGateway.gateway.tokens.dismiss")}>
              {t("appsBrowserGateway.gateway.tokens.dismiss")}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-3 py-2 font-mono text-xs text-foreground">
              {revealed ? created.token : maskedTokenLabel(created)}
            </code>
            {revealed ? (
              <Button variant="outline" size="sm" onClick={() => void copyToken(created.token)}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                {t("appsBrowserGateway.gateway.copy")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setRevealed(true)}>
                {t("appsBrowserGateway.gateway.show")}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {tokens.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("appsBrowserGateway.gateway.tokens.noTokens")}
        </div>
      ) : (
        <>
          {/* Desktop / tablet: full table. */}
          <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
            <table className="w-full min-w-(--sz-44rem) text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">{t("appsBrowserGateway.gateway.tokens.token")}</th>
                  <th className="px-4 py-2.5">{t("appsBrowserGateway.gateway.tokens.owner")}</th>
                  <th className="px-4 py-2.5">{t("appsBrowserGateway.gateway.tokens.createdAt")}</th>
                  <th className="px-4 py-2.5">{t("appsBrowserGateway.gateway.tokens.lastUsed")}</th>
                  <th className="px-4 py-2.5">{t("appsBrowserGateway.gateway.tokens.expires")}</th>
                  <th className="px-4 py-2.5">{t("appsBrowserGateway.gateway.tokens.status")}</th>
                  <th className="px-4 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => {
                  const status = tokenStatus(token);
                  const canRevoke = status !== "revoked";
                  return (
                    <tr key={token.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{token.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{maskedTokenLabel(token)}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{token.clientLabel || token.ownerNote || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground"><RelativeTime value={token.createdAt} /></td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {token.lastUsedAt ? <RelativeTime value={token.lastUsedAt} /> : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {token.revokedAt ? "—" : token.expiresAt ? <RelativeTime value={token.expiresAt} /> : t("appsBrowserGateway.gateway.tokens.noExpiry")}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canRevoke ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              setConfirmToken({ id: token.id, name: token.name });
                              setRevokeName("");
                            }}
                          >
                            {t("appsBrowserGateway.gateway.tokens.revoke")}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards so status + Revoke stay reachable. */}
          <div className="space-y-3 sm:hidden">
            {tokens.map((token) => {
              const status = tokenStatus(token);
              const canRevoke = status !== "revoked";
              return (
                <div key={token.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{token.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{maskedTokenLabel(token)}</div>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <TokenField label={t("appsBrowserGateway.gateway.tokens.owner")} value={token.clientLabel || token.ownerNote || "—"} />
                    <TokenField label={t("appsBrowserGateway.gateway.tokens.createdAt")} value={<RelativeTime value={token.createdAt} />} />
                    <TokenField
                      label={t("appsBrowserGateway.gateway.tokens.lastUsed")}
                      value={token.lastUsedAt ? <RelativeTime value={token.lastUsedAt} /> : "—"}
                    />
                    <TokenField
                      label={t("appsBrowserGateway.gateway.tokens.expires")}
                      value={
                        token.revokedAt ? "—" : token.expiresAt ? <RelativeTime value={token.expiresAt} /> : t("appsBrowserGateway.gateway.tokens.noExpiry")
                      }
                    />
                  </dl>
                  {canRevoke ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 w-full text-xs text-destructive hover:text-destructive"
                      onClick={() => {
                        setConfirmToken({ id: token.id, name: token.name });
                        setRevokeName("");
                      }}
                    >
                      {t("appsBrowserGateway.gateway.tokens.revoke")}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5" />
        {t("appsBrowserGateway.gateway.tokens.recorded")}
      </p>

      {confirmToken ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-5 shadow-lg">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("appsBrowserGateway.gateway.tokens.revokeTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("appsBrowserGateway.gateway.tokens.revokeBody", { name: confirmToken.name })}
              </p>
            </div>
            <Input
              value={revokeName}
              onChange={(e) => setRevokeName(e.target.value)}
              placeholder={confirmToken.name}
              aria-label={t("appsBrowserGateway.gateway.tokens.confirmAria")}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmToken(null);
                  setRevokeName("");
                }}
              >
                {t("appsBrowserGateway.connections.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={revokeName.trim() !== confirmToken.name || revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(confirmToken.id)}
              >
                {revokeMutation.isPending ? t("appsBrowserGateway.gateway.tokens.revoking") : t("appsBrowserGateway.gateway.tokens.revokeToken")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
