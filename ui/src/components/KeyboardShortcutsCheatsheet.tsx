import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n";

interface ShortcutEntry {
  keys: string[];
  label: string;
  /** Render keys as a simultaneous chord (joined with "+") rather than a
   *  "then" sequence. */
  combo?: boolean;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const sections: ShortcutSection[] = [
  {
    title: t("commonChatTools.inbox"),
    shortcuts: [
      { keys: ["j"], label: t("commonChatTools.moveDown") },
      { keys: ["↓"], label: t("commonChatTools.moveDown") },
      { keys: ["k"], label: t("commonChatTools.moveUp") },
      { keys: ["↑"], label: t("commonChatTools.moveUp") },
      { keys: ["←"], label: t("commonChatTools.collapseGroup") },
      { keys: ["→"], label: t("commonChatTools.expandGroup") },
      { keys: ["Enter"], label: t("commonChatTools.openItem") },
      { keys: ["a"], label: t("commonChatTools.archiveItem") },
      { keys: ["y"], label: t("commonChatTools.archiveItem") },
      { keys: ["r"], label: t("commonChatTools.markRead") },
      { keys: ["U"], label: t("commonChatTools.markUnread") },
    ],
  },
  {
    title: t("commonChatTools.taskDetail"),
    shortcuts: [
      { keys: ["y"], label: t("commonChatTools.quickArchive") },
      { keys: ["g", "i"], label: t("commonChatTools.goInbox") },
      { keys: ["g", "c"], label: t("commonChatTools.focusComposer") },
    ],
  },
  {
    title: t("commonChatTools.decisions"),
    shortcuts: [
      { keys: ["j"], label: t("commonChatTools.moveDown") },
      { keys: ["↓"], label: t("commonChatTools.moveDown") },
      { keys: ["k"], label: t("commonChatTools.moveUp") },
      { keys: ["↑"], label: t("commonChatTools.moveUp") },
      { keys: ["Enter"], label: t("commonChatTools.openCloseDecision") },
      { keys: ["x"], label: t("commonChatTools.dismissDecision") },
    ],
  },
  {
    title: t("commonChatTools.global"),
    shortcuts: [
      { keys: ["/"], label: "Search current page or quick search" },
      { keys: ["c"], label: "New task" },
      { keys: ["["], label: "Toggle sidebar" },
      { keys: ["]"], label: "Toggle panel" },
      { keys: ["?"], label: "Show keyboard shortcuts" },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-(--shadow-extract-10)">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
  return (
    <>
      <div className="divide-y divide-border border-t border-border">
        {sections.map((section) => (
          <div key={section.title} className="px-5 py-3">
            <h3 className="mb-2 text-(length:--text-micro) font-semibold uppercase tracking-wider text-muted-foreground">
              {t(`sharedOperationsExtra.shortcut${section.title.replace(" ", "")}`)}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label + shortcut.keys.join()}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-foreground/90">{shortcut.label}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={key} className="flex items-center gap-1">
                        {i > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {shortcut.combo ? "+" : t("commonChatTools.then")}
                          </span>
                        )}
                        <KeyCap>{key}</KeyCap>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {t("sharedOperationsExtra.press")} <KeyCap>Esc</KeyCap> {t("sharedOperationsExtra.toClose")} &middot; {t("sharedOperationsExtra.shortcutsDisabledInFields")}
        </p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{t("sharedOperationsExtra.keyboardShortcuts")}</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
