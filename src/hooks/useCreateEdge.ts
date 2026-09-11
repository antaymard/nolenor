import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useParams } from "@tanstack/react-router";
import { toastError } from "@/components/utils/errorUtils";
import { trackCanvasSync } from "@/lib/trackCanvasSync";

type CreateEdgeInput = {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

/**
 * Crée une connection côté serveur (`edges.create`) : llmId généré et
 * persisté AVANT tout ajout local — le change add ReactFlow arrive donc
 * déjà avec l'id définitif, pas de remap ni de doublon au re-push Convex.
 * Miroir de `useCreateNode`. Le toast d'échec vit ici, pas au point
 * d'appel (onConnect).
 */
export function useCreateEdge() {
  const createEdges = useMutation(api.edges.create);
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const createEdge = async ({
    source,
    target,
    sourceHandle,
    targetHandle,
  }: CreateEdgeInput): Promise<string> => {
    try {
      const created = await trackCanvasSync(() =>
        createEdges({
          edges: [
            {
              canvasId,
              source,
              target,
              ...(sourceHandle !== undefined && { sourceHandle }),
              ...(targetHandle !== undefined && { targetHandle }),
            },
          ],
        }),
      );
      return created[0].edgeId;
    } catch (error) {
      toastError(error, "Could not add the connection");
      throw error;
    }
  };

  return { createEdge };
}
