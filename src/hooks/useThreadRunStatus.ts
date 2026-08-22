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
 * Résout le statut affichable d'un thread à partir des champs bruts renvoyés
 * par le serveur (`threads.getThreadInfo`, `threads.listCanvasThreads`).
 *
 * Prend les champs plutôt qu'un `threadId` : les deux appelants les ont déjà
 * dans une query en cours, et un abonnement de plus par thread affiché serait
 * payé pour rien.
 *
 * Le seul travail réel est temporel. Un thread resté `running` doit basculer
 * en `stale` alors que rien, côté données, ne bouge : sans réveil, la pastille
 * tournerait jusqu'au prochain rendu fortuit. Un unique `setTimeout` posé sur
 * l'instant exact du basculement suffit — pas d'intervalle qui réveille le
 * composant toutes les secondes pour ne rien changer.
 */
export function useResolvedRunStatus(
  fields: ThreadRunFields | null | undefined,
): ResolvedRunStatus {
  const runStatus = fields?.runStatus ?? null;
  const runStartedAt = fields?.runStartedAt ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (runStatus !== "running" || runStartedAt == null) return;

    const staleAt = runStartedAt + RUN_STALE_MS;
    const remaining = staleAt - Date.now();
    // Déjà périmé au montage : `now` initial le voit, rien à programmer.
    if (remaining <= 0) return;

    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [runStatus, runStartedAt]);

  return useMemo(
    () => resolveRunStatus({ runStatus, runStartedAt }, now),
    [runStatus, runStartedAt, now],
  );
}

/**
 * La tâche est-elle à afficher sur le canvas, ancrée à ses nodes ?
 *
 * Même travail temporel que `useResolvedRunStatus`, sur un autre instant : ici
 * la pastille doit **disparaître** toute seule, à la péremption d'un `running`
 * ou à la fin de la rémanence d'un tour conclu. Aucune donnée ne change à ce
 * moment-là, donc sans réveil elle resterait jusqu'au prochain rendu fortuit.
 *
 * Un `setTimeout` unique posé sur l'instant exact, jamais un intervalle : c'est
 * un événement daté d'avance, pas quelque chose à surveiller.
 *
 * Exister comme hook appelé par un composant *par tâche* est ce qui donne à
 * chacune sa propre minuterie — même raison que `ThreadRunStatusPill` dans la
 * liste de threads.
 */
export function useIsLiveOnCanvas(fields: ThreadDockFields): boolean {
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = getCanvasLiveExpiry(fields);

  useEffect(() => {
    if (expiresAt == null) return;

    const remaining = expiresAt - Date.now();
    // Déjà échu au montage : le `now` initial le voit, rien à programmer.
    if (remaining <= 0) return;

    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  return isLiveOnCanvas(fields, now);
}
