import { t as tNewUi } from "@/i18n";
import {
  CircleCheck,
  CircleAlert,
  Loader2,
  Play,
  ChevronRight,
} from "lucide-react";
import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export type TestState = "idle" | "running" | "pass" | "fail";

const copy = {
  idle: {
    title: tNewUi("newUi.kbcf9391cef9a"),
    description: tNewUi("newUi.k0325fd6d4e81"),
    action: tNewUi("newUi.ke031e0df30c9"),
  },
  running: {
    title: tNewUi("newUi.k04dfed9c1dcd"),
    description: tNewUi("newUi.ka1c61e0777f0"),
    action: "Testing…",
  },
  pass: {
    title: tNewUi("newUi.k856dd8c8677b"),
    description: tNewUi("newUi.k4edd56668f39"),
    action: tNewUi("newUi.k022f6c3d06bf"),
  },
  warn: {
    title: tNewUi("newUi.k4f1fc01dc19d"),
    description: tNewUi("newUi.ka186aaf27c8a"),
    action: tNewUi("newUi.k022f6c3d06bf"),
  },
  fail: {
    title: "Couldn't connect",
    description: tNewUi("newUi.kc7c75083b81f"),
    action: tNewUi("newUi.k1fa8f72fe8a0"),
  },
} as const;

const prerequisiteCopy = {
  idle: { title: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.idleTitle"), description: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.idleDescription"), action: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.idleAction") },
  running: { title: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.runningTitle"), description: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.runningDescription"), action: tNewUi("miscResidualRound3.checking") },
  pass: { title: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.passTitle"), description: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.passDescription"), action: tNewUi("upgrade1029AutoMerged.runtimeTestCard.checkAgain") },
  warn: { title: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.warnTitle"), description: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.warnDescription"), action: tNewUi("upgrade1029AutoMerged.runtimeTestCard.checkAgain") },
  fail: { title: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.failTitle"), description: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.failDescription"), action: tNewUi("upgrade1029AutoMerged.runtimeTestCard.prerequisites.failAction") },
} as const;

export function RuntimeTestCard({
  state,
  result,
  error,
  onTest,
  disabled = false,
  variant = "connection",
  metadataOnly = false,
}: {
  state: TestState | "warn";
  result: AdapterEnvironmentTestResult | null;
  error?: string | null;
  onTest: () => void;
  disabled?: boolean;
  variant?: "connection" | "prerequisites";
  metadataOnly?: boolean;
}) {
  const missingRuntime = state === "fail"
    ? result?.checks.find(check => check.code === "acpx_runtime_package_missing")
    : undefined;
  const content = missingRuntime
    ? { ...copy.fail, title: tNewUi("upgrade1029AutoMerged.runtimeTestCard.runtimeMissing"), description: missingRuntime.message }
    : (variant === "prerequisites" ? prerequisiteCopy : copy)[state];
  const description = metadataOnly && state === "idle"
    ? tNewUi("upgrade1029AutoMerged.runtimeTestCard.metadataOnlyIdle")
    : metadataOnly && state === "running"
      ? tNewUi("upgrade1029AutoMerged.runtimeTestCard.metadataOnlyRunning")
      : content.description;
  const Icon =
    state === "running"
      ? Loader2
      : state === "pass"
        ? CircleCheck
        : state === "fail" || state === "warn"
          ? CircleAlert
          : Play;
  return (
    <section
      aria-label={tNewUi("newUi.ka3b5b9078336")}
      className="rounded-lg border border-border bg-card"
    >
      <div className="flex items-start gap-3 p-4 sm:items-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted",
            state === "pass"
              ? "text-green-600 dark:text-green-400"
              : state === "fail"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4",
              state === "running" && "animate-spin motion-reduce:animate-none",
            )}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role={state === "fail" ? "alert" : "status"}
            aria-atomic="true"
            className="min-w-0 space-y-1"
          >
            <h3 className="text-sm font-medium">{content.title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {state === "fail" && error ? error : description}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-center"
            disabled={disabled || state === "running"}
            onClick={onTest}
          >
            {content.action}
          </Button>
        </div>
      </div>
      {result && result.checks.length > 0 && (
        <details
          key={`${state}:${result.testedAt}`}
          className="group border-t border-border"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-open:rotate-90"
            />
            {tNewUi("newUi.k7cc561a55b3b")}
          </summary>
          <ul className="space-y-3 px-4 pb-4">
            {result.checks.map((check) => (
              <li
                key={check.code}
                className="flex gap-2 text-xs leading-relaxed"
              >
                {check.level === "error" || check.level === "warn" ? (
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  />
                ) : (
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-foreground">{check.message}</p>
                  {check.detail && (
                    <p className="break-all text-muted-foreground">
                      {check.detail}
                    </p>
                  )}
                  {check.hint && (
                    <p className="text-muted-foreground">{check.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
