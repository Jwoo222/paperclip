import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

/** Providers supply only credentials the current user is authorized to use.
 * Values are opaque connection references, never secret values. */
export function ApiKeyCredentialField({ options, connectionId, onConnectionChange, value, onChange,
  disabled, loading, error, providerName, keysUrl, label = t("newUi.k16f0ee47f993") }: {
  options: { id: string; label: string; disabled?: boolean }[];
  connectionId: string | null;
  onConnectionChange(id: string): void;
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  providerName: string;
  keysUrl: string;
  label?: string;
}) {
  const id = useId();
  const choices = connectionId && !options.some(option => option.id === connectionId)
    ? [{ id: connectionId, label: loading ? t("upgrade2610Apps.apiKeyField.checkingSavedKey") : t("upgrade2610Apps.apiKeyField.previouslySelectedUnavailable"), disabled: true }, ...options] : options;
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {choices.length > 0 && <select id={id} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={connectionId ?? ""} disabled={disabled} onChange={event => onConnectionChange(event.target.value)}>
      {choices.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
      <option value="">{t("newUi.k9b6cc5e19d07")}</option>
    </select>}
    {!connectionId && <Input id={choices.length ? `${id}-new` : id} aria-label={choices.length ? t("upgrade2610Apps.apiKeyField.newApiKey") : undefined}
      type="password" autoComplete="off" value={value} disabled={disabled}
      onChange={event => { onConnectionChange(""); onChange(event.target.value); }} placeholder={t("upgrade2610Apps.apiKeyField.pastePlaceholder", { providerName })} />}
    {loading && <p role="status" className="text-sm text-muted-foreground">{t("newUi.kb34650f62297")}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t("upgrade2610Apps.apiKeyField.loadFailed")} {error}</p>}
    <a href={keysUrl} target="_blank" rel="noreferrer" className="text-sm underline">{t("upgrade2610Apps.apiKeyField.getKeyLink", { providerName })}</a>
  </div>;
}
