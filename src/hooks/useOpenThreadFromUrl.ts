import { useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useOpenNoleThread } from "@/hooks/useOpenNoleThread";

/**
 * Ouvre la conversation Nolë désignée par l'URL (`?thread=<threadId>`).
 *
 * C'est la porte d'entrée depuis la home : le bouton « Open » d'une tâche mène
 * au canvas *et* à la conversation, là où le dock d'activité l'aurait ouverte
 * d'un clic. Le param est déclaré sur la route canvas
 * (cf. `routes/canvas/$canvasId.tsx`).
 *
 * `ready` doit attendre le canvas chargé : `useCanvasBootstrap` remet
 * `activeThreadId` à `null` au changement de canvas, et ouvrir avant ce
 * nettoyage reviendrait à ouvrir pour rien.
 *
 * Le param est retiré aussitôt consommé (`replace`, pas d'entrée d'historique) :
 * resté dans l'URL, il rouvrirait la conversation à chaque rechargement, et un
 * lien copié ensuite emporterait une conversation privée avec lui.
 */
export function useOpenThreadFromUrl({
  ready,
  onOpened,
}: {
  ready: boolean;
  /** Ce que la surface doit faire de plus pour montrer la conversation — sur
   *  mobile, basculer sur l'onglet chat. */
  onOpened?: () => void;
}): void {
  // `select` borne l'abonnement au seul `thread`, même raison que
  // `useInitialViewportFromUrl`.
  const threadId = useSearch({
    strict: false,
    select: (search) => (search as { thread?: string }).thread,
  });
  const navigate = useNavigate();
  const openThread = useOpenNoleThread();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !threadId || handledRef.current === threadId) return;
    handledRef.current = threadId;

    openThread(threadId);
    onOpened?.();

    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, thread: undefined }),
      replace: true,
    });
  }, [ready, threadId, openThread, onOpened, navigate]);
}
