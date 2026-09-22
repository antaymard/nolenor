import { useCallback, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import type { BookmarkTarget } from "@/../convex/schemas/canvasBookmarksSchema";
import { VIEWPORT_TRANSITION_MS } from "@/lib/canvasViewportFraming";
import { useCommandCenterStore } from "@/stores/commandCenterStore";
import { useGoToNode } from "./useGoToNode";
import { useApplyFraming } from "./useViewportFraming";

/**
 * Emmène la vue sur un repère, quelle que soit sa forme.
 *
 * Les trois cas ne partagent pas la même mécanique : `fitView` cadre *des
 * nodes* (positions absolues, donc une cible dans une frame marche sans rien
 * faire de particulier) tandis que `setViewport` pose *une vue*. D'où ce
 * routeur, pour que les appelants — panneau de la toolbar, command palette —
 * n'aient jamais à connaître la différence.
 *
 * Rend `false` quand le repère ne mène plus nulle part (node supprimé), pour
 * que l'appelant puisse le signaler plutôt que d'avoir l'air de ne rien faire.
 *
 * À appeler à l'intérieur d'un `ReactFlowProvider`.
 */
export function useGoToBookmark(): (target: BookmarkTarget) => boolean {
  const { fitView, getNodes, setNodes } = useReactFlow();
  const goToNode = useGoToNode();
  const applyFraming = useApplyFraming();

  return useCallback(
    (target: BookmarkTarget): boolean => {
      if (target.kind === "framing") {
        // Un cadrage est figé dans le monde : il mène toujours quelque part,
        // même si ce quelque part s'est vidé entre-temps.
        applyFraming(target.framing);
        return true;
      }

      if (target.kind === "node") {
        // `useGoToNode` centre ET sélectionne, mais `fitView` sur un id inconnu
        // ne fait rien du tout : on vérifie donc avant, pour pouvoir le dire.
        if (!getNodes().some((node) => node.id === target.nodeId)) return false;
        goToNode(target.nodeId);
        return true;
      }

      // Sélection : les ids disparus sont filtrés plutôt que fatals — perdre un
      // node sur cinq ne doit pas invalider le repère, juste le rétrécir.
      const liveIds = new Set(getNodes().map((node) => node.id));
      const targets = target.nodeIds.filter((nodeId) => liveIds.has(nodeId));
      if (targets.length === 0) return false;

      const targetSet = new Set(targets);
      setNodes((nodes) =>
        nodes.map((node) => ({ ...node, selected: targetSet.has(node.id) })),
      );
      fitView({
        nodes: targets.map((nodeId) => ({ id: nodeId })),
        duration: VIEWPORT_TRANSITION_MS,
        // Mêmes bornes que `useGoToNode` : assez près pour lire, assez loin
        // pour qu'un groupe étalé tienne à l'écran.
        minZoom: 0.5,
        maxZoom: 1,
      });
      return true;
    },
    [applyFraming, fitView, getNodes, goToNode, setNodes],
  );
}

/**
 * Publie la navigation du canvas courant dans le `commandCenterStore`.
 *
 * Appelé une fois par `CanvasFlow`. C'est ce qui permet au command palette —
 * monté à la racine, hors du `ReactFlowProvider` — de proposer les repères
 * puis d'y aller : il lit `canvasNavigator` au lieu d'appeler React Flow, et
 * son absence lui dit qu'aucun canvas n'est ouvert.
 *
 * Le nettoyage au démontage n'est pas cosmétique : sans lui, quitter le canvas
 * pour la home laisserait le palette croire qu'il peut encore naviguer, avec
 * une closure pointant sur une instance React Flow morte.
 */
export function useRegisterCanvasNavigator(): void {
  const goToBookmark = useGoToBookmark();
  const setCanvasNavigator = useCommandCenterStore(
    (state) => state.setCanvasNavigator,
  );

  useEffect(() => {
    setCanvasNavigator(goToBookmark);
    return () => setCanvasNavigator(null);
  }, [goToBookmark, setCanvasNavigator]);
}
