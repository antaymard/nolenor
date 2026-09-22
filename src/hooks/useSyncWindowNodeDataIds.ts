import { useEffect } from "react";
import { useNodeDataIdsByNodeId } from "@/lib/nodeIdentity";
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
 * windows, monté par `WindowsContainer`.
 */
export function useSyncWindowNodeDataIds(): void {
  const nodeDataIdByXyNodeId = useNodeDataIdsByNodeId();
  const syncWindowNodeDataIds = useWindowsStore(
    (s) => s.syncWindowNodeDataIds,
  );

  useEffect(() => {
    syncWindowNodeDataIds(nodeDataIdByXyNodeId);
  }, [nodeDataIdByXyNodeId, syncWindowNodeDataIds]);
}
