import { useEffect, useState } from "react";
import {
  formatRunDuration,
  type ThreadDockFields,
} from "@/lib/threadRunStatus";

/** Cadence du compteur de durée. Une seconde : c'est l'unité qu'il affiche. */
const DURATION_TICK_MS = 1000;

/**
 * Depuis combien de temps le tour dure, ou `null` s'il n'a jamais démarré.
 *
 * Le seul intervalle récurrent de cet écran, et il est assumé : un compteur qui
 * ne compte pas ne sert à rien. Il ne tourne que pendant le run — une fois le
 * tour conclu la durée est fixe (`runEndedAt - runStartedAt`), il n'y a plus
 * rien à réveiller.
 */
export function useRunDuration(
  thread: Pick<ThreadDockFields, "runStartedAt" | "runEndedAt">,
  isRunning: boolean,
): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), DURATION_TICK_MS);
    return () => clearInterval(timer);
  }, [isRunning]);

  const { runStartedAt, runEndedAt } = thread;
  if (runStartedAt == null) return null;

  const until = isRunning ? now : (runEndedAt ?? now);
  return formatRunDuration(until - runStartedAt);
}
