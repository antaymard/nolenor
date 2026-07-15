import { useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { toastError } from "@/components/utils/errorUtils";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import type { Doc } from "@/../convex/_generated/dataModel";
import { stringifyPlateDocumentForStorage } from "@/../convex/lib/plateDocumentStorage";

interface UpdateNodeDataInput {
  nodeDataId: Id<"nodeDatas">;
  values: Record<string, unknown>;
}

interface UseUpdateNodeDataValuesReturn {
  updateNodeDataValues: (input: UpdateNodeDataInput) => Promise<void>;
  isUpdating: boolean;
}

export function useUpdateNodeDataValues(): UseUpdateNodeDataValuesReturn {
  const updateValuesMutation = useMutation(api.nodeDatas.updateValues);

  const {
    getNodeData,
    updateNodeData: updateStoreNodeData,
    setNodeData,
  } = useNodeDataStore();

  const snapshotsRef = useRef<Map<Id<"nodeDatas">, Doc<"nodeDatas">>>(
    new Map(),
  );
  const isUpdatingRef = useRef(false);

  const saveSnapshot = useCallback(
    (nodeDataId: Id<"nodeDatas">): boolean => {
      const nodeData = getNodeData(nodeDataId);
      if (!nodeData) {
        console.warn(
          `[useUpdateNodeDataValues] NodeData ${nodeDataId} not found in store`,
        );
        return false;
      }
      snapshotsRef.current.set(nodeDataId, structuredClone(nodeData));
      return true;
    },
    [getNodeData],
  );

  const revertNodeData = useCallback(
    (nodeDataId: Id<"nodeDatas">) => {
      const snapshot = snapshotsRef.current.get(nodeDataId);
      if (snapshot) {
        setNodeData(nodeDataId, snapshot);
        snapshotsRef.current.delete(nodeDataId);
      }
    },
    [setNodeData],
  );

  const updateNodeDataValues = useCallback(
    async (input: UpdateNodeDataInput): Promise<void> => {
      const { nodeDataId, values } = input;
      const nodeData = getNodeData(nodeDataId);
      const valuesForMutation =
        nodeData?.type === "document"
          ? {
              ...values,
              doc: stringifyPlateDocumentForStorage(values.doc),
            }
          : nodeData?.type === "blocknote"
            ? {
                ...values,
                doc: JSON.stringify(values.doc),
              }
            : values;

      const hasChanges = Object.entries(valuesForMutation).some(
        ([key, nextValue]) => !Object.is(nodeData?.values?.[key], nextValue),
      );

      if (!hasChanges) {
        return;
      }

      // Sauvegarder le snapshot pour rollback potentiel
      const snapshotSaved = saveSnapshot(nodeDataId);
      if (!snapshotSaved) return;

      isUpdatingRef.current = true;

      // Mise à jour optimiste immédiate du store
      updateStoreNodeData(nodeDataId, values);

      try {
        // Exécution de la mutation serveur
        await updateValuesMutation({
          _id: nodeDataId,
          values: valuesForMutation,
        });
        // Succès : nettoyer le snapshot
        snapshotsRef.current.delete(nodeDataId);
      } catch (error) {
        // Erreur : revert vers le snapshot
        revertNodeData(nodeDataId);
        toastError(error, "Error updating");
      } finally {
        isUpdatingRef.current = false;
      }
    },
    [
      getNodeData,
      updateValuesMutation,
      updateStoreNodeData,
      saveSnapshot,
      revertNodeData,
    ],
  );

  return {
    updateNodeDataValues,
    isUpdating: isUpdatingRef.current,
  };
}
