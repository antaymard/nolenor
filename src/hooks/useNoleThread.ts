import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "@/types";

/**
 * Au-delà de ce délai sans interaction, la conversation du canvas n'est plus
 * reprise : on repart d'une conversation vierge.
 */
export const THREAD_REUSE_WINDOW_MS = 5 * 60 * 60 * 1000;

/**
 * Résout la conversation Nolë du canvas courant.
 *
 * - Résolution en lecture ponctuelle (pas d'abonnement) et rejouée au
 *   changement de canvas : un sous-agent qui écrit en base ne doit jamais
 *   faire basculer la conversation affichée sous les doigts de l'utilisateur.
 * - Création paresseuse : ouvrir le panel n'écrit rien. Le thread naît à
 *   l'envoi du premier message, via `ensureThread`. Tant qu'il n'existe pas,
 *   `threadId` vaut `null` et l'appelant affiche une conversation vierge.
 */
export function useNoleThread({
  canvasId,
}: {
  canvasId: Id<"canvases"> | undefined;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const convex = useConvex();
  const startThread = useMutation(api.threads.startThread);

  // Création en vol : deux envois rapprochés ne doivent pas créer deux threads.
  // Le state seul ne suffit pas, il est périmé dans la closure de `ensureThread`.
  const pendingCreation = useRef<Promise<string> | null>(null);
  const currentThreadId = useRef<string | null>(null);
  // Incrémenté à chaque résolution : un thread créé pour le canvas A ne doit
  // pas être adopté si l'utilisateur est passé sur le canvas B entre-temps.
  const resolutionId = useRef(0);

  const setResolvedThreadId = useCallback((id: string | null) => {
    currentThreadId.current = id;
    setThreadId(id);
  }, []);

  useEffect(() => {
    resolutionId.current += 1;

    if (!canvasId) {
      setResolvedThreadId(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setResolvedThreadId(null);
    pendingCreation.current = null;

    convex
      .query(api.threads.getLatestCanvasThread, { canvasId })
      .then((latest) => {
        if (cancelled) return;
        const isFresh =
          latest !== null &&
          Date.now() - latest.lastActivityTime < THREAD_REUSE_WINDOW_MS;
        setResolvedThreadId(isFresh ? latest.threadId : null);
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Erreur lors de la résolution du thread:", error);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [convex, canvasId, setResolvedThreadId]);

  /** Renvoie le thread courant, en le créant s'il n'existe pas encore. */
  const ensureThread = useCallback(async (): Promise<string> => {
    if (currentThreadId.current) return currentThreadId.current;
    if (pendingCreation.current) return pendingCreation.current;
    if (!canvasId) {
      throw new Error("Impossible de créer un thread sans canvas.");
    }

    // L'appelant reçoit le thread créé dans tous les cas — son message part
    // vers le canvas qui était actif au moment de l'envoi — mais on ne l'adopte
    // comme thread affiché que si on est toujours sur ce canvas.
    const startedFor = resolutionId.current;
    const creation = startThread({ canvasId })
      .then(({ threadId: created }) => {
        if (resolutionId.current === startedFor) setResolvedThreadId(created);
        return created;
      })
      .finally(() => {
        pendingCreation.current = null;
      });

    pendingCreation.current = creation;
    return creation;
  }, [canvasId, startThread, setResolvedThreadId]);

  /**
   * Repart d'une conversation vierge. Rien n'est écrit en base : le thread sera
   * créé au premier message.
   */
  const resetThread = useCallback(() => {
    pendingCreation.current = null;
    setResolvedThreadId(null);
  }, [setResolvedThreadId]);

  return { threadId, isLoading, ensureThread, resetThread };
}
