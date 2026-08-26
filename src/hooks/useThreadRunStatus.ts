import { useEffect, useMemo, useState } from "react";
import {
  RUN_STALE_MS,
  getCanvasLiveExpiry,
  isLiveOnCanvas,
  resolveRunStatus,
  type ResolvedRunStatus,
  type ThreadDockFields,
  type ThreadRunFields,
} from "@/lib/threadRunStatus";

/**
 * Un `now` qui se rafraîchit une fois, à l'instant demandé — `null` pour ne
 * jamais se réveiller.
 *
 * Le seul travail temporel de ces hooks est un basculement daté d'avance : un
 * `running` qui devient périmé, une rémanence qui s'achève. Aucune donnée ne
 * bouge à cet instant-là, donc sans réveil l'affichage attendrait le prochain
 * rendu fortuit.
 *
 * Un `setTimeout` unique posé sur l'instant exact, jamais un intervalle : c'est
 * un événement daté, pas quelque chose à surveiller.
 */
function useClockAt(expiresAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiresAt == null) return;

    const remaining = expiresAt - Date.now();
    // Déjà échu au montage : le `now` initial le voit, rien à programmer.
    if (remaining <= 0) return;

    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  return now;
}

/**
 * Résout le statut affichable d'un thread à partir des champs bruts renvoyés
 * par le serveur (`threads.getThreadInfo`, `threads.listCanvasThreads`).
 *
 * Prend les champs plutôt qu'un `threadId` : les deux appelants les ont déjà
 * dans une query en cours, et un abonnement de plus par thread affiché serait
 * payé pour rien.
 *
 * Le basculement à surveiller est la péremption : un thread resté `running`
 * doit passer `stale` sans qu'aucune donnée ne bouge.
 */
export function useResolvedRunStatus(
  fields: ThreadRunFields | null | undefined,
): ResolvedRunStatus {
  const runStatus = fields?.runStatus ?? null;
  const runStartedAt = fields?.runStartedAt ?? null;
  const now = useClockAt(
    runStatus === "running" && runStartedAt != null
      ? runStartedAt + RUN_STALE_MS
      : null,
  );

  return useMemo(
    () => resolveRunStatus({ runStatus, runStartedAt }, now),
    [runStatus, runStartedAt, now],
  );
}

/**
 * La tâche est-elle à afficher sur le canvas, ancrée à ses nodes ?
 *
 * Ici la pastille doit **disparaître** toute seule, à la péremption d'un
 * `running` ou à la fin de la rémanence d'un tour conclu.
 *
 * Exister comme hook appelé par un composant *par tâche* est ce qui donne à
 * chacune sa propre minuterie — même raison que `ThreadRunStatusPill` dans la
 * liste de threads.
 */
export function useIsLiveOnCanvas(fields: ThreadDockFields): boolean {
  const now = useClockAt(getCanvasLiveExpiry(fields));
  return isLiveOnCanvas(fields, now);
}
