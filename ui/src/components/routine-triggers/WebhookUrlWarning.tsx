import { t as tNewUi } from "@/i18n";
import { InlineBanner } from "@/components/InlineBanner";
import { webhookUrlWarningReason } from "@/lib/webhook-url-warning";

const warnings = {
  loopback: {
    title: tNewUi("newUi.ka9a1746fc4ce"),
    message: tNewUi("newUi.ka9a81db39064"),
  },
  private: {
    title: tNewUi("newUi.kc5cb153410ca"),
    message: tNewUi("newUi.kc29f7cbd601e"),
  },
  tailscale: {
    title: tNewUi("newUi.k76597a677eab"),
    message: tNewUi("newUi.kde0c0242b824"),
  },
  https: {
    title: tNewUi("newUi.k9ca07d2c9188"),
    message: tNewUi("newUi.k44225a79115a"),
  },
  invalid: {
    title: tNewUi("newUi.k4b75da522044"),
    message: tNewUi("newUi.kfbf5cdd3397e"),
  },
};

export function WebhookUrlWarning({ url }: { url: string }) {
  const reason = webhookUrlWarningReason(url);
  if (!reason) return null;
  const warning = warnings[reason];
  return <InlineBanner tone="warning" title={warning.title}>
    <div className="space-y-2">
      <p>{warning.message}</p>
      <p>{tNewUi("newUi.k588d3cda70e7")}</p>
      <a className="underline underline-offset-4" href="https://docs.paperclip.ing/reference/deploy/https/" target="_blank" rel="noopener noreferrer">{tNewUi("newUi.kf9d4d69f64cd")}</a>
    </div>
  </InlineBanner>;
}
