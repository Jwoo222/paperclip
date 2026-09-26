import { t as tNewUi } from "@/i18n";
import { useRef, useState } from "react";

/** Keeps stop requests independent of draft submission and prevents double clicks. */
export function useComposerStop(onStop?: () => Promise<void>, pending = false) {
  const inFlight = useRef(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    if (!onStop || inFlight.current || pending) return;
    inFlight.current = true;
    setStopping(true);
    setError(null);
    try {
      await onStop();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tNewUi("newUi.k88604c18c9fe"),
      );
    } finally {
      inFlight.current = false;
      setStopping(false);
    }
  }

  return { stop, stopping: stopping || pending, error };
}
