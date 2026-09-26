import { t as tNewUi } from "@/i18n";
import { SetupWizardNavigation, SetupWizardSidebar } from "../SetupWizard";
export { SetupWizardSidebar as ChatSetupSidebar };
export function ChatSetupNavigation(props: {
  labels?: string[]; step: number; availableStep: number; disabled?: boolean; onSelect: (step: number) => void;
}) {
  return <SetupWizardNavigation {...props} labels={props.labels ?? [tNewUi("newUi.kf7c0bf69c3cf"), tNewUi("newUi.ke1ad3eb2a000"), tNewUi("newUi.kfe6951113784")]} ariaLabel={tNewUi("newUi.k17f5c180dcd1")} />;
}
