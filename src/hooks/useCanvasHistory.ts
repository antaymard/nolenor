import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasOp } from "@/../convex/schemas/canvasOpsSchema";
import {
  getLiveEdgeDoc,
  getLiveNodeDoc,
  getNodeDataDoc,
} from "@/lib/canvasDocCache";
import {
  addPendingNodeDatasToListQuery,
  applyEdgeDataPatchesToListQuery,
  applyNodePatchesToListQuery,
  removeEdgesFromListQuery,
  removeNodesFromListQuery,
  restoreEdgesInListQuery,
  restoreNodesInListQuery,
} from "@/lib/flowNodes";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { toastError } from "@/components/utils/errorUtils";
import {
  useCanvasHistoryStore,
  type HistoryEntry,
} from "@/stores/canvasHistoryStore";

/**
 * Retire d'une opération ce qui n'a plus de sens à appliquer.
 *
 * La pile est locale mais le document est partagé et temps réel : entre le
 * geste et son annulation, l'agent ou un collaborateur a pu supprimer la
 * cible. Plutôt que d'envoyer une transaction vouée à échouer en bloc, on
 * élague d'abord contre l'état vivant — ce qui reste s'applique, le reste
 * n'avait plus d'objet.
 */
function pruneOp(
  op: CanvasOp,
  liveNodeIds: Set<string>,
  liveEdgeIds: Set<string>,
): CanvasOp | null {
  switch (op.kind) {
    case "patchNodes": {
      const updates = op.updates.filter((update) =>
        liveNodeIds.has(update.nodeId),
      );
      return updates.length > 0 ? { ...op, updates } : null;
    }
    case "trashNodes": {
      const nodeIds = op.nodeIds.filter((id) => liveNodeIds.has(id));
      return nodeIds.length > 0 ? { ...op, nodeIds } : null;
    }
    case "untrashNodes": {
      // Déjà remis en service par quelqu'un d'autre : rien à faire.
      const nodeIds = op.nodeIds.filter((id) => !liveNodeIds.has(id));
      return nodeIds.length > 0 ? { ...op, nodeIds } : null;
    }
    case "patchEdges": {
      const updates = op.updates.filter((update) =>
        liveEdgeIds.has(update.edgeId),
      );
      return updates.length > 0 ? { ...op, updates } : null;
    }
    case "trashEdges": {
      const edgeIds = op.edgeIds.filter((id) => liveEdgeIds.has(id));
      return edgeIds.length > 0 ? { ...op, edgeIds } : null;
    }
    case "untrashEdges": {
      const edgeIds = op.edgeIds.filter((id) => !liveEdgeIds.has(id));
      return edgeIds.length > 0 ? { ...op, edgeIds } : null;
    }
  }
}

/**
 * Undo/redo du canvas.
 *
 * N'annule que les gestes de l'utilisateur courant, dans cet onglet — cf. le
 * commentaire de `canvasHistoryStore`. Le périmètre est la mise en page et la
 * structure : le contenu d'un node (texte BlockNote, cellules de table) garde
 * son propre undo, celui de son éditeur.
 */
export function useCanvasHistory(canvasId: Id<"canvases">) {
  const { getNodes, getEdges } = useReactFlow();

  const past = useCanvasHistoryStore((state) => state.past);
  const future = useCanvasHistoryStore((state) => state.future);

  const applyOps = useMutation(api.canvasOps.apply).withOptimisticUpdate(
    (localStore, { canvasId: targetCanvasId, ops }) => {
      for (const op of ops) {
        switch (op.kind) {
          case "patchNodes":
            applyNodePatchesToListQuery(
              localStore,
              targetCanvasId,
              op.updates,
            );
            break;
          case "trashNodes":
            removeNodesFromListQuery(localStore, targetCanvasId, op.nodeIds);
            break;
          case "untrashNodes": {
            const docs = op.nodeIds.flatMap((id) => {
              const doc = getLiveNodeDoc(id);
              return doc ? [doc] : [];
            });
            restoreNodesInListQuery(localStore, targetCanvasId, docs);
            // Le cadre sans son contenu clignoterait en « node vide » le temps
            // d'un aller-retour : on remet aussi le nodeData connu.
            addPendingNodeDatasToListQuery(
              localStore,
              targetCanvasId,
              docs.flatMap((doc) => {
                const nodeData = getNodeDataDoc(doc.nodeDataId);
                return nodeData ? [nodeData] : [];
              }),
            );
            break;
          }
          case "patchEdges":
            applyEdgeDataPatchesToListQuery(
              localStore,
              targetCanvasId,
              op.updates.map((update) => ({
                id: update.edgeId,
                data: update.data,
              })),
            );
            break;
          case "trashEdges":
            removeEdgesFromListQuery(localStore, targetCanvasId, op.edgeIds);
            break;
          case "untrashEdges":
            restoreEdgesInListQuery(
              localStore,
              targetCanvasId,
              op.edgeIds.flatMap((id) => {
                const doc = getLiveEdgeDoc(id);
                return doc ? [doc] : [];
              }),
            );
            break;
        }
      }
    },
  );

  const run = useCallback(
    async (direction: "undo" | "redo") => {
      const store = useCanvasHistoryStore.getState();
      // Ctrl+Z maintenu répète le binding : deux annulations ne doivent pas
      // s'entrelacer.
      if (store.isApplying) return;

      const pop = direction === "undo" ? store.popUndo : store.popRedo;
      const pushBack =
        direction === "undo" ? store.pushUndone : store.pushRedone;

      const liveNodeIds = new Set(getNodes().map((node) => node.id));
      const liveEdgeIds = new Set(getEdges().map((edge) => edge.id));

      // Les entrées devenues sans objet sont jetées, pas jouées : on descend
      // jusqu'à la première qui a encore quelque chose à dire.
      let entry: HistoryEntry | undefined;
      let ops: CanvasOp[] = [];
      for (;;) {
        entry = pop();
        if (!entry) break;
        ops = (direction === "undo" ? entry.undo : entry.redo).flatMap((op) => {
          const pruned = pruneOp(op, liveNodeIds, liveEdgeIds);
          return pruned ? [pruned] : [];
        });
        if (ops.length > 0) break;
      }

      if (!entry || ops.length === 0) {
        toast(
          direction === "undo" ? "Nothing left to undo" : "Nothing left to redo",
        );
        return;
      }

      const appliedEntry = entry;
      store.setApplying(true);
      try {
        await trackCanvasSync(() => applyOps({ canvasId, ops }));
        pushBack(appliedEntry);
      } catch (error) {
        // L'entrée n'est pas remise sur l'autre pile : elle n'a rien fait.
        // Convex a déjà annulé l'update optimiste.
        toastError(
          error,
          direction === "undo" ? "Could not undo" : "Could not redo",
        );
      } finally {
        useCanvasHistoryStore.getState().setApplying(false);
      }
    },
    [applyOps, canvasId, getEdges, getNodes],
  );

  const undo = useCallback(() => run("undo"), [run]);
  const redo = useCallback(() => run("redo"), [run]);

  return {
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
