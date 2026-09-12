import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGoToFraming } from "@/hooks/useViewportFraming";
import {
  framingFromViewport,
  getFramingDelta,
  getPaneSize,
  readFraming,
} from "@/lib/canvasViewportFraming";
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
  const { getNodes, getViewport } = useReactFlow();
  const goToFraming = useGoToFraming();
  const register = useCanvasNavigatorStore((state) => state.register);
  const unregister = useCanvasNavigatorStore((state) => state.unregister);

  // La poignée est enregistrée une fois pour la vie du canvas : elle appelle
  // ces refs plutôt que les closures du render, pour ne pas se réenregistrer
  // à chaque fois que React Flow renvoie de nouvelles fonctions.
  const getNodesRef = useRef(getNodes);
  const getViewportRef = useRef(getViewport);
  const goToFramingRef = useRef(goToFraming);
  // Déclaré AVANT l'effet d'enregistrement : React exécute les effets dans
  // l'ordre de déclaration, les refs sont donc à jour quand il s'exécute.
  useEffect(() => {
    getNodesRef.current = getNodes;
    getViewportRef.current = getViewport;
    goToFramingRef.current = goToFraming;
  }, [getNodes, getViewport, goToFraming]);

  useEffect(() => {
    const navigator: CanvasNavigator = {
      getMarkers: () => {
        const { nodeDatas } = useNodeDataStore.getState();
        // Delta figé à l'instantané : la vue ne bouge pas tant que la modale
        // est ouverte, aucun abonnement n'est nécessaire.
        const paneSize = getPaneSize();
        const current =
          paneSize === null
            ? null
            : framingFromViewport(getViewportRef.current(), paneSize);
        return sortMarkers(markersFromNodes(getNodesRef.current())).map(
          (marker): NavigatorMarker => {
            const values = marker.nodeDataId
              ? nodeDatas.get(marker.nodeDataId)?.values
              : undefined;
            const framing = readFraming(values?.view);
            return {
              xyNodeId: marker.id,
              nodeDataId: marker.nodeDataId,
              title: typeof values?.title === "string" ? values.title : "",
              framing,
              delta:
                framing === null || current === null || paneSize === null
                  ? null
                  : getFramingDelta(framing, current, paneSize),
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
