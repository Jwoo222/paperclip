import { t as tNewUi } from "@/i18n";
import { t } from "@/i18n";
import { useId, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SlackAvatarProps {
  agentName: string;
  appName: string;
  avatarUrl: string;
}

/** Manual fallback shared by Slack onboarding and its Settings page. */
export function SlackAvatarContent({
  agentName,
  appName,
  avatarUrl,
  compact = false,
}: SlackAvatarProps & { compact?: boolean }) {
  const id = useId();
  const filename = `${appName.replace(/[^a-zA-Z0-9_-]+/g, "-") || "agent"}-avatar.png`;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const response = await fetch(avatarUrl);
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/png")
      )
        throw new Error(tNewUi("newUi.kcc96f4530134"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="space-y-8">
      <section
        aria-labelledby={`${id}-download`}
        className="flex flex-col items-start gap-6 sm:flex-row sm:items-center"
      >
        <img
          src={avatarUrl}
          width={512}
          height={512}
          alt={`${agentName}’s Cliptoon avatar`}
          className="size-40 shrink-0 rounded-lg bg-muted object-contain"
        />
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 id={`${id}-download`} className="text-sm font-semibold">
              {compact
                ? tNewUi("newUi.kce5bdd090305")
                : tNewUi("newUi.kfc5927ad100f")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {tNewUi("newUi.k1439257c77a5")}
            </p>
          </div>
          <Button variant="outline" asChild>
            <a
              href={avatarUrl}
              download={filename}
              aria-disabled={downloading}
              onClick={(event) => {
                event.preventDefault();
                void download();
              }}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {tNewUi("newUi.ke7dc2a1ba0c6")}
            </a>
          </Button>
          {downloadError && (
            <p role="alert" className="text-sm text-destructive">
              {tNewUi("newUi.kf77ab7e7bc1e")}
            </p>
          )}
        </div>
      </section>

      <details open={compact ? undefined : true} className="space-y-4">
        <summary
          className={
            compact
              ? "cursor-pointer text-sm underline underline-offset-4"
              : "hidden"
          }
        >
          {tNewUi("newUi.k68a7030b41af")}
        </summary>
        <section aria-labelledby={`${id}-upload`} className="space-y-4">
          <div className="space-y-1">
            <h2 id={`${id}-upload`} className="text-sm font-semibold">
              {compact ? tNewUi("newUi.k9ef6fd056f3b") : tNewUi("newUi.k733c836bb93e")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tNewUi("newUi.k55ef0a39349b")}
            </p>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {tNewUi("newUi.k30cfde1ec067")}{" "}
                <ExternalLink className="inline size-3" />
              </a>{" "}
              {tNewUi("newUi.k566c1f30e50c")} <strong>{appName}</strong>.
            </li>
            <li>
              {t("workResidualRound3.choose")} <strong>{tNewUi("newUi.kd094b334d809")}</strong>{tNewUi("newUi.k9a9402254014")}{" "}
              <strong>{tNewUi("newUi.k6ad97855804a")}</strong>.
            </li>
            <li>
              {tNewUi("newUi.k80e4ad056bd7")} <strong>{tNewUi("newUi.k22ef051d0b84")}</strong>{tNewUi("newUi.ke1451431a3cf")}{" "}
              <span className="break-all font-mono text-xs">{filename}</span>.
            </li>
            <li>
              {tNewUi("newUi.k483a16f11bf4")} <strong>{tNewUi("newUi.k35322b5bb5a2")}</strong> {tNewUi("newUi.k14a3f3bbc732")}
            </li>
          </ol>
        </section>
      </details>
    </div>
  );
}


export function SlackAvatarSettings(props: SlackAvatarProps) {
  return (
    <section className="space-y-4" aria-label={tNewUi("newUi.k761226caa94e")}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{tNewUi("newUi.kfb65e8cf15fa")}</h2>
        <p className="text-sm text-muted-foreground">
          {tNewUi("newUi.kc36d819e7bc6")} {props.agentName}{tNewUi("newUi.k001b345bd19c")}
        </p>
      </div>
      <SlackAvatarContent {...props} compact />
    </section>
  );
}
