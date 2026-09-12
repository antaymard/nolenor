import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGoToFraming } from "@/hooks/useViewportFraming";
import { readFraming } from "@/lib/canvasViewportFraming";
import { markersFromNodes, sortMarkers } from "@/lib/viewportMarkers";
import {
  useCanvasNavigatorStore,
  type CanvasNavigator,
  type NavigatorMarker,
} from "@/stores/canvasNavigatorStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";

/**
 * Expose la navigation du canvas courant au command center.
 *
 * Ne rend rien : c'est un branchement. `CommandCenter` vit à la racine, donc
 * hors du `ReactFlowProvider` (cf. `canvasNavigatorStore`) ; ce composant, lui,
 * est monté dans la route canvas et peut donc lire les nodes et bouger la vue.
 * Il en fait une poignée impérative que la palette appelle à la demande.
 *
 * À monter à l'intérieur du `ReactFlowProvider`.
 */
export default function CanvasNavigatorBridge() {
  const { getNodes } = useReactFlow();
  const goToFraming = useGoToFraming();
  const register = useCanvasNavigatorStore((state) => state.register);
  const unregister = useCanvasNavigatorStore((state) => state.unregister);

  // La poignée est enregistrée une fois pour la vie du canvas : elle appelle
  // ces refs plutôt que les closures du render, pour ne pas se réenregistrer
  // à chaque fois que React Flow renvoie de nouvelles fonctions.
  const getNodesRef = useRef(getNodes);
  const goToFramingRef = useRef(goToFraming);
  // Déclaré AVANT l'effet d'enregistrement : React exécute les effets dans
  // l'ordre de déclaration, les refs sont donc à jour quand il s'exécute.
  useEffect(() => {
    getNodesRef.current = getNodes;
    goToFramingRef.current = goToFraming;
  }, [getNodes, goToFraming]);

  useEffect(() => {
    const navigator: CanvasNavigator = {
      getMarkers: () => {
        const { nodeDatas } = useNodeDataStore.getState();
        return sortMarkers(markersFromNodes(getNodesRef.current())).map(
          (marker): NavigatorMarker => {
            const values = marker.nodeDataId
              ? nodeDatas.get(marker.nodeDataId)?.values
              : undefined;
            return {
              xyNodeId: marker.id,
              nodeDataId: marker.nodeDataId,
              title: typeof values?.title === "string" ? values.title : "",
              framing: readFraming(values?.view),
            };
          },
        );
      },
      goTo: (framing) => goToFramingRef.current(framing),
    };

    register(navigator);
    return () => unregister(navigator);
  }, [register, unregister]);

  return null;
}
