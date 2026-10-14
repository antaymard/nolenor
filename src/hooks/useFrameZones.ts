import { useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  readFrameZones,
  zoneOf,
  type FrameZones,
  type Zone,
} from "@/../convex/lib/frameZones";
import { arrangeFrame } from "@/lib/frameZoneLayout";
import { applyNodePatchesToListQuery } from "@/lib/flowNodes";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { toastError } from "@/components/utils/errorUtils";
import { useCanvasStore } from "@/stores/canvasStore";
import { recordUndo } from "@/stores/canvasHistoryStore";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";

/**
 * Les zones d'une frame (cf. `convex/lib/frameZones.ts`) : les lire, et les
 * changer — poser un Kanban, renommer une colonne, en ajouter, en retirer.
 *
 * Changer la grille range aussitôt le contenu dans la nouvelle : chaque node
 * garde sa zone (lue dans l'ancienne grille), ou prend celle sous lui quand
 * la frame était libre. Le rangement est annulable comme un drag ; les zones
 * elles-mêmes, comme le titre de la frame, ne le sont pas — elles vivent dans
 * les values, que l'historique du canvas ne couvre pas.
 */
export function useFrameZones(
  frameId: string,
  nodeDataId: Id<"nodeDatas"> | undefined,
) {
  const stored = useNodeDataValuesField(nodeDataId, "zones");
  const zones = useMemo(() => readFrameZones(stored), [stored]);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { getNodes } = useReactFlow();

  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const patchNodes = useMutation(api.nodes.patch);
  const patchNodesOptimistic = useMemo(
    () =>
      patchNodes.withOptimisticUpdate((localStore, { updates }) => {
        if (canvasId)
          applyNodePatchesToListQuery(localStore, canvasId, updates);
      }),
    [patchNodes, canvasId],
  );

  /**
   * `remap` dit où va le contenu d'une zone de l'ancienne grille : par défaut
   * la zone de mêmes indices. Retirer une colonne décale celles d'après.
   */
  const setZones = useCallback(
    (next: FrameZones | null, remap: (zone: Zone) => Zone = (zone) => zone) => {
      if (!nodeDataId) return;
      void updateNodeDataValues({ nodeDataId, values: { zones: next } });
      if (!next) return;

      // Rendue dépliée (seul état où la grille s'édite) : la taille du node
      // React Flow est sa taille stockée.
      const nodes = getNodes();
      const frame = nodes.find((node) => node.id === frameId);
      if (!frame) return;
      const size = {
        width: frame.width ?? frame.measured?.width ?? 0,
        height: frame.height ?? frame.measured?.height ?? 0,
      };
      const { after, before } = arrangeFrame({
        frame: { id: frameId, ...size },
        zones: next,
        children: nodes
          .filter((node) => node.parentId === frameId)
          .map((node) => ({
            id: node.id,
            position: node.position,
            width: node.measured?.width ?? node.width ?? 0,
            height: node.measured?.height ?? node.height ?? 0,
          })),
        zoneFor: (rect) =>
          zones ? remap(zoneOf(zones, size, rect)) : zoneOf(next, size, rect),
      });
      if (after.length === 0) return;

      recordUndo(
        { kind: "patchNodes", updates: before },
        { kind: "patchNodes", updates: after },
      );
      void trackCanvasSync(() =>
        patchNodesOptimistic({ updates: after }),
      ).catch((error: unknown) =>
        toastError(error, "Could not arrange the frame"),
      );
    },
    [
      frameId,
      nodeDataId,
      zones,
      getNodes,
      updateNodeDataValues,
      patchNodesOptimistic,
    ],
  );

  return { zones, setZones };
}
