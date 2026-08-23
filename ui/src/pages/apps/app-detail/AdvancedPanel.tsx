import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Lock } from "lucide-react";
import type { AppDefinition, ToolConnection } from "@paperclipai/shared";
import { credentialConfigPath, getAvailableConnectionMethod, humanizeConnectionDisplayName } from "@paperclipai/shared";
import { toolsApi } from "@/api/tools";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";
import { redactUrlSecrets } from "@/lib/redact-url-secrets";
import { navigateTopLevel } from "@/lib/browserNavigation";
import type { AppDetailSectionProps } from "./types";
import { useTranslation, t } from "@/i18n";

export function AdvancedPanel({
  connection,
  appName,
  galleryEntry,
  removing,
  onRemove,
  onReplaced,
}: Pick<AppDetailSectionProps, "connection" | "appName" | "galleryEntry"> & {
  removing: boolean;
  onRemove: () => void;
  onReplaced: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <KeySection connection={connection} galleryEntry={galleryEntry} onReplaced={onReplaced} />
      <TechnicalDetails connection={connection} />
      <DangerZone appName={appName} removing={removing} onRemove={onRemove} />
    </div>
  );
}

function KeySection({
  connection,
  galleryEntry,
  onReplaced,
}: {
  connection: ToolConnection;
  galleryEntry: AppDefinition | null;
  onReplaced: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-bold text-foreground">{t("appDetail.advanced.key")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("appDetail.advanced.keyHint")}
            </p>
          </div>
        </div>
        {!open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t("appDetail.actions.replaceKey")}
          </Button>
        )}
      </div>
      {open && (
        <div className="border-t border-border px-5 py-4">
          <ReconnectForm
            connection={connection}
            galleryEntry={galleryEntry}
            onCancel={() => setOpen(false)}
            onReconnected={() => {
              setOpen(false);
              onReplaced();
            }}
          />
        </div>
      )}
    </section>
  );
}

export function ReconnectCard({
  connection,
  galleryEntry,
  onReconnected,
}: {
  connection: ToolConnection;
  galleryEntry: AppDefinition | null;
  onReconnected: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const reconnectOAuth = useMutation({
    mutationFn: () => toolsApi.startOAuth(connection.id),
    onSuccess: ({ authorizationUrl }) => navigateTopLevel(authorizationUrl),
    onError: (error) =>
      pushToast({
        title: t("appDetail.errors.startSignin"),
        body: error instanceof Error ? error.message : t("appDetail.errors.tryAgain"),
        tone: "error",
      }),
  });
  const oauth = connection.authKind === "oauth";

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-5">
      <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">
        {oauth ? t("appDetail.advanced.reconnectRequired") : t("appDetail.advanced.needsReconnect")}
      </h2>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
        {connection.healthMessage?.trim() || (oauth
          ? t("appDetail.advanced.oauthExpired")
          : t("appDetail.advanced.keyStopped"))}
      </p>
      <div className="mt-3">
        {oauth ? (
          <Button
            type="button"
            size="sm"
            disabled={reconnectOAuth.isPending}
            onClick={() => reconnectOAuth.mutate()}
          >
            {reconnectOAuth.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {reconnectOAuth.isPending ? t("appDetail.advanced.openingSignin") : t("appDetail.actions.reconnect")}
          </Button>
        ) : (
          <ReconnectForm connection={connection} galleryEntry={galleryEntry} onReconnected={onReconnected} />
        )}
      </div>
    </div>
  );
}

function ReconnectForm({
  connection,
  galleryEntry,
  onCancel,
  onReconnected,
}: {
  connection: ToolConnection;
  galleryEntry: AppDefinition | null;
  onCancel?: () => void;
  onReconnected: () => void;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const method = galleryEntry && Array.isArray(galleryEntry.methods)
    ? getAvailableConnectionMethod(galleryEntry)
    : null;
  const fields = (method?.credentialFields ?? []).map((field) => ({
    ...field,
    configPath: credentialConfigPath(field),
    helpUrl: method?.consoleLinks?.keys ?? method?.consoleLinks?.docs ?? "",
  }));
  const [values, setValues] = useState<Record<string, string>>({});
  const [single, setSingle] = useState("");
  const usesGallery = fields.length > 0 && !!galleryEntry;

  const reconnect = useMutation({
    mutationFn: () => {
      const credentialValues = usesGallery
        ? values
        : { "credentials.authorization": single.trim() };
      return toolsApi.reconnectConnection(connection.id, credentialValues);
    },
    onSuccess: (result) => {
      const healthy =
        result.connection.healthStatus === "healthy" || result.connection.healthStatus === "unknown";
      if (healthy) {
        pushToast({
          title: t("appDetail.advanced.reconnected"),
          body: t("appDetail.advanced.backOnline", { app: humanizeConnectionDisplayName(connection) }),
          tone: "success",
        });
        onReconnected();
      } else {
        pushToast({
          title: t("appDetail.advanced.stillNotWorking"),
          body: result.connection.healthMessage?.trim() || t("appDetail.advanced.keyRejected"),
          tone: "error",
        });
      }
    },
    onError: (error) =>
      pushToast({
        title: t("appDetail.advanced.keyFailed"),
        body: error instanceof Error ? error.message : t("appDetail.advanced.checkKey"),
        tone: "error",
      }),
  });

  const filled = usesGallery
    ? fields.every((f) => f.required === false || (values[f.configPath]?.trim().length ?? 0) > 0)
    : single.trim().length > 0;

  return (
    <div className="space-y-3">
      {usesGallery ? (
        fields.map((field) => (
          <div key={field.configPath}>
            <label className="text-xs font-medium text-foreground">{field.label}</label>
            <Input
              type="password"
              autoComplete="off"
              value={values[field.configPath] ?? ""}
              onChange={(e) => setValues({ ...values, [field.configPath]: e.target.value })}
              placeholder="****************"
              className="mt-1 h-10 font-mono"
            />
            {field.helpUrl && (
              <a
                href={field.helpUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-foreground underline underline-offset-2"
              >
                {t("appDetail.advanced.whereToFind")} <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
        ))
      ) : (
        <Input
          type="password"
          autoComplete="off"
          value={single}
          onChange={(e) => setSingle(e.target.value)}
          placeholder={t("appDetail.advanced.keyPlaceholder")}
          className="h-10 font-mono"
        />
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!filled || reconnect.isPending} onClick={() => reconnect.mutate()}>
          {reconnect.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {reconnect.isPending ? t("appDetail.advanced.checking") : t("appDetail.advanced.checkReconnect")}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={reconnect.isPending}>
            {t("appDetail.actions.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}

function TechnicalDetails({ connection }: { connection: ToolConnection }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-border bg-card px-5 py-4">
      <h2 className="text-sm font-bold text-foreground">{t("appDetail.advanced.technicalDetails")}</h2>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-(--gtc-59)">
        <dt className="text-muted-foreground">{t("appDetail.advanced.address")}</dt>
        <dd className="break-all font-mono text-foreground">{connectionAddress(connection)}</dd>
        <dt className="text-muted-foreground">{t("appDetail.advanced.connectionType")}</dt>
        <dd className="text-foreground">{connectionTransportLabel(connection.transport)}</dd>
      </dl>
    </section>
  );
}

export function DangerZone({
  appName,
  removing,
  onRemove,
}: {
  appName: string;
  removing: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="rounded-xl border border-destructive/40 bg-card">
      <div className="border-b border-destructive/40 px-5 py-3 text-sm font-bold text-destructive">
        {t("appDetail.advanced.dangerZone")}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-foreground">{t("appDetail.advanced.removeThisApp")}</p>
          <p className="text-xs text-muted-foreground">
            {t("appDetail.advanced.removeHint", { app: appName })}
          </p>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={removing}>
              {t("appDetail.actions.cancel")}
            </Button>
            <Button variant="destructive" size="sm" onClick={onRemove} disabled={removing}>
              {removing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("appDetail.advanced.confirmRemove")}
            </Button>
          </div>
        ) : (
          <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
            {t("appDetail.actions.removeApp")}
          </Button>
        )}
      </div>
    </section>
  );
}

export function connectionAddress(connection: ToolConnection): string {
  const config = connection.config ?? connection.transportConfig ?? {};
  const value = config.url ?? config.endpoint ?? config.remoteUrl;
  if (typeof value === "string" && value.trim().length > 0) return redactUrlSecrets(value);
  if (connection.transport === "local_stdio") return t("appDetail.advanced.localCommand");
  return t("appDetail.advanced.notSet");
}

export function connectionTransportLabel(transport: ToolConnection["transport"]): string {
  if (transport === "mcp_remote") return t("appDetail.advanced.remoteHttp");
  if (transport === "local_stdio") return t("appDetail.advanced.localCommand");
  return t("appDetail.advanced.unknown");
}
