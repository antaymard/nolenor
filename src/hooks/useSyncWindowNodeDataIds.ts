import { useEffect } from "react";
import { useNodeDataIdsByNodeId } from "@/lib/nodeIdentity";
import { isPendingDocId } from "@/lib/pendingDocIds";
import { useWindowsStore } from "@/stores/windowsStore";

/**
 * Garde les windows ouvertes braquées sur le `nodeDataId` courant de leur
 * node.
 *
 * Le besoin vient des créations local-first : `useCreateNode` monte le node
 * avec un `nodeDataId` factice (`pending_<llmId>`) et ne le remplace par
 * l'id serveur qu'à la réponse de la mutation. Ouvrir la window dans cet
 * intervalle — un double-clic immédiat sur un blocknote qu'on vient de
 * créer — y fige l'id factice, qui disparaît ensuite de tous les stores :
 * l'éditeur ne se montait plus et il fallait fermer/rouvrir la fenêtre.
 *
 * Le node React Flow est la source d'autorité du lien node → nodeData
 * (`useCreateNode` le repointe à la confirmation, le sync Convex aussi) ; il
 * suffit donc de suivre cette Map. Un seul abonnement pour toutes les
 * windows, à monter par chaque hôte de windows : `WindowsContainer` sur
 * desktop, `MobileNodeOverlay` sur mobile — sans lui, la window reste sur
 * « Creating » pour de bon.
 */
export function useSyncWindowNodeDataIds(): void {
  const nodeDataIdByXyNodeId = useNodeDataIdsByNodeId();
  const syncWindowNodeDataIds = useWindowsStore(
    (s) => s.syncWindowNodeDataIds,
  );
  // La Map seule ne suffit pas : une window ouverte sur un id factice *après*
  // que le node a déjà basculé sur le vrai (callback d'ouverture pas encore
  // re-rendu, par exemple) ne change pas la Map, et l'effet ne repasserait
  // jamais. On resynchronise donc aussi dès qu'une window pending apparaît.
  const hasPendingWindow = useWindowsStore((s) =>
    s.openedWindows.some((w) => isPendingDocId(w.nodeDataId)),
  );

  useEffect(() => {
    syncWindowNodeDataIds(nodeDataIdByXyNodeId);
  }, [nodeDataIdByXyNodeId, syncWindowNodeDataIds, hasPendingWindow]);
}
