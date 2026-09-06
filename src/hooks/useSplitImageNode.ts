import { useCallback, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCreateNode } from "./useCreateNode";
import { useUpdateNodeDataValues } from "./useUpdateNodeDataValues";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import type { Id } from "@/../convex/_generated/dataModel";
import { toastError } from "@/components/utils/errorUtils";

export type SplitImageItem = {
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: number;
  key?: string;
};

/** Décalage en cascade entre le node source et chaque node extrait. */
const CASCADE_STEP = 48;

function getImageNodeConfig() {
  return prebuiltNodesConfig.find((config) => config.node.type === "image");
}

type UseSplitImageNodeReturn = {
  extractImage: (args: {
    xyNodeId: string;
    nodeDataId: Id<"nodeDatas">;
    image: SplitImageItem;
    remainingImages: SplitImageItem[];
  }) => Promise<boolean>;
  splitAll: (args: {
    xyNodeId: string;
    nodeDataId: Id<"nodeDatas">;
    images: SplitImageItem[];
  }) => Promise<boolean>;
  isSplitting: boolean;
};

/**
 * Opération inverse du merge (`SelectionContextMenu.mergeImageNodes`) :
 * sort une ou toutes les images d'un node multi-images vers de nouveaux
 * nodes image, en mode déplacement (retirées de la source).
 *
 * La création précède toujours le retrait de la source : si la création
 * échoue, la source reste intacte. Le refcount R2 (`syncRefs`) garde le blob
 * vivant tant qu'au moins un node le référence, donc déplacer une image
 * `key`-ée ne supprime jamais son fichier.
 */
export function useSplitImageNode(): UseSplitImageNodeReturn {
  const { getNode } = useReactFlow();
  const { createNode } = useCreateNode();
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const [isSplitting, setIsSplitting] = useState(false);

  const createExtractedNode = useCallback(
    async (
      xyNodeId: string,
      image: SplitImageItem,
      index: number,
    ): Promise<boolean> => {
      const imageNodeConfig = getImageNodeConfig();
      if (!imageNodeConfig) {
        toastError("Image node configuration not found", "Error");
        return false;
      }

      const source = getNode(xyNodeId);
      const origin = source?.position ?? { x: 0, y: 0 };
      const position = {
        x: origin.x + CASCADE_STEP * (index + 1),
        y: origin.y + CASCADE_STEP * (index + 1),
      };

      try {
        await createNode({
          node: {
            ...imageNodeConfig.node,
            width: source?.width ?? imageNodeConfig.node.width,
            height: source?.height ?? imageNodeConfig.node.height,
            data: {
              ...imageNodeConfig.node.data,
              color:
                (source?.data?.color as string | undefined) ??
                imageNodeConfig.node.data.color,
              variant:
                (source?.data?.variant as string | undefined) ?? "default",
            },
          },
          position,
          initialValues: { images: [image] },
          // La source garde la sélection : sa toolbar (et le Dialog
          // d'édition) reste montée, la modale ne se ferme pas.
          selectNewNode: false,
        });
        return true;
      } catch (error) {
        toastError(error, "Error extracting image");
        return false;
      }
    },
    [createNode, getNode],
  );

  const extractImage: UseSplitImageNodeReturn["extractImage"] = useCallback(
    async ({ xyNodeId, nodeDataId, image, remainingImages }) => {
      setIsSplitting(true);
      try {
        const created = await createExtractedNode(xyNodeId, image, 0);
        if (!created) return false;
        return await updateNodeDataValues({
          nodeDataId,
          values: { images: remainingImages },
        });
      } finally {
        setIsSplitting(false);
      }
    },
    [createExtractedNode, updateNodeDataValues],
  );

  const splitAll: UseSplitImageNodeReturn["splitAll"] = useCallback(
    async ({ xyNodeId, nodeDataId, images }) => {
      if (images.length < 2) return false;
      setIsSplitting(true);
      try {
        // Toutes les créations d'abord : un échec au milieu laisse la
        // source intacte, sans perte d'image.
        for (let i = 0; i < images.length; i++) {
          const created = await createExtractedNode(xyNodeId, images[i], i);
          if (!created) return false;
        }
        // Un seul update source → un seul snapshot de version.
        return await updateNodeDataValues({
          nodeDataId,
          values: { images: [] },
        });
      } finally {
        setIsSplitting(false);
      }
    },
    [createExtractedNode, updateNodeDataValues],
  );

  return { extractImage, splitAll, isSplitting };
}
