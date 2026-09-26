import { t as tNewUi } from "@/i18n";
import { Button } from "@/components/ui/button";

export function AiConnectionLegacyNotice({
  onAdopt,
  readOnly = false,
}: {
  onAdopt: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">
        {tNewUi("newUi.kc836e59bd188")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {tNewUi("newUi.k941214853865")}
      </p>
      {!readOnly && (
        <Button variant="outline" className="self-start" onClick={onAdopt}>
          {tNewUi("newUi.k7efd0256f59b")}
        </Button>
      )}
    </div>
  );
}
