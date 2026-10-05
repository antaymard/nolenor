import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import type { AppearanceVariantEntry } from "@/lib/nodeAppearance";

/**
 * Applique une variante à un ou plusieurs nodes : la variante elle-même, puis
 * les dimensions par défaut de chacun.
 *
 * Les nodes sont marqués `resizing` le temps de la mutation de dimensions :
 * c'est ce qui protège leur nouvelle taille de la sync Convex → React Flow,
 * qui la ramènerait sinon à l'ancienne jusqu'au retour serveur.
 */
export function useApplyVariant() {
  const { updateNode } = useReactFlow();
  const { updateCanvasNodes } = useUpdateCanvasNode();
  const patchNodes = useMutation(api.nodes.patch);

  return useCallback(
    async ({ changes }: AppearanceVariantEntry) => {
      if (changes.length === 0) return;

      // Les variantes qui gardent la taille stockée (celles d'une frame, cf.
      // `preservesStoredSize`) ne changent que la clé : pas de dimensions à
      // poser, ni localement ni en base.
      const resized = changes.filter(
        ({ variant }) => variant.preservesStoredSize !== true,
      );

      resized.forEach(({ nodeId, variant }) => {
        updateNode(nodeId, {
          width: variant.defaultWidth,
          height: variant.defaultHeight,
          resizing: true,
        });
      });

      void updateCanvasNodes(
        changes.map(({ nodeId, variantKey }) => ({
          nodeId,
          props: { variant: variantKey },
        })),
      );

      if (resized.length === 0) return;

      try {
        await patchNodes({
          updates: resized.map(({ nodeId, variant }) => ({
            nodeId,
            props: {
              width: variant.defaultWidth,
              height: variant.defaultHeight,
            },
          })),
        });
      } finally {
        resized.forEach(({ nodeId }) =>
          updateNode(nodeId, { resizing: false }),
        );
      }
    },
    [updateNode, updateCanvasNodes, patchNodes],
  );
}
