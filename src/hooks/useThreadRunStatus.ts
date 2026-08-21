import { useEffect, useMemo, useState } from "react";
import {
  RUN_STALE_MS,
  resolveRunStatus,
  type ResolvedRunStatus,
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
