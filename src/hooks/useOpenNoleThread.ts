import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useNoleStore } from "@/stores/noleStore";

/**
 * Accuse réception d'une tâche : l'utilisateur l'a vue, elle sort du dock
 * d'activité.
 *
 * Ne se plaint jamais d'un échec. Le serveur no-ope sur un tour encore en
 * cours, et si l'appel se perd la pastille reste simplement à l'écran —
 * l'utilisateur recliquera.
 */
export function useMarkThreadReviewed(): (threadId: string) => void {
  const markReviewed = useMutation(api.threads.markThreadReviewed);

  return useCallback(
    (threadId: string) => {
      void markReviewed({ threadId }).catch(() => {});
    },
    [markReviewed],
  );
}

/**
 * Ouvre une conversation Nolë dans le panneau, et accuse réception.
 *
 * Le geste vivait en trois exemplaires — dock d'activité, marqueurs du canvas,
 * threads associés d'un node — et les trois ne faisaient pas la même chose :
 * deux accusaient réception, le troisième non, et le dock le faisait depuis un
 * autre composant que son handler. Consulter, c'est revoir : les trois portes
 * mènent au même endroit, elles doivent avoir le même effet.
 */
export function useOpenNoleThread(): (threadId: string) => void {
  const setActiveThreadId = useNoleStore((state) => state.setActiveThreadId);
  const setPanelLayout = useNoleStore((state) => state.setPanelLayout);
  const markReviewed = useMarkThreadReviewed();

  return useCallback(
    (threadId: string) => {
      setActiveThreadId(threadId);
      setPanelLayout("expanded");
      markReviewed(threadId);
    },
    [markReviewed, setActiveThreadId, setPanelLayout],
  );
}
