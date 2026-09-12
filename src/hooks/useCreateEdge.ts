import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { generateLlmId } from "@/../convex/lib/llmId";
import { useParams } from "@tanstack/react-router";
import { addPendingEdgesToListQuery } from "@/lib/flowNodes";
import { toastError } from "@/components/utils/errorUtils";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { recordUndo } from "@/stores/canvasHistoryStore";

type CreateEdgeInput = {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

/**
 * Crée une connection en local-first : le llmId est généré côté client et
 * retourné IMMÉDIATEMENT — l'appelant affiche l'edge au relâcher du geste,
 * avant la réponse serveur. Le cache optimiste porte un doc factice
 * (`_id` `pending_<llmId>`, llmId définitif, markerEnd par défaut) pour que
 * les re-pushs intermédiaires gardent l'edge en attente jusqu'au doc réel
 * (même llmId) ; le serveur préserve l'id — idempotent sur retry, refus
 * cross-canvas (cf. `EdgeModels.createEdges`).
 *
 * `settled` résout à la persistance ; en échec, le toast vit ici — le
 * retrait de l'edge local reste à la charge de l'appelant (pas de `trash`
 * serveur d'un edge jamais créé).
 */
export function useCreateEdge() {
  const createEdges = useMutation(api.edges.create).withOptimisticUpdate(
    (localStore, { edges }) => {
      if (edges.length === 0) return;
      addPendingEdgesToListQuery(
        localStore,
        edges[0].canvasId,
        edges.flatMap((item): Doc<"edges">[] => {
          if (item.id === undefined) return [];
          return [
            {
              _id: `pending_${item.id}` as Id<"edges">,
              _creationTime: Date.now(),
              id: item.id,
              canvasId: item.canvasId,
              source: item.source,
              target: item.target,
              ...(item.sourceHandle !== undefined && {
                sourceHandle: item.sourceHandle,
              }),
              ...(item.targetHandle !== undefined && {
                targetHandle: item.targetHandle,
              }),
              // Parité `DEFAULT_MARKER_END` serveur : l'edge en attente
              // rend exactement comme le doc confirmé le remplacera.
              markerEnd: {
                type: "arrow",
                width: 30,
                height: 30,
                strokeWidth: 1,
              },
            },
          ];
        }),
      );
    },
  );
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const createEdge = ({
    source,
    target,
    sourceHandle,
    targetHandle,
  }: CreateEdgeInput) => {
    const edgeId = generateLlmId();
    const settled = trackCanvasSync(() =>
      createEdges({
        edges: [
          {
            id: edgeId,
            canvasId,
            source,
            target,
            ...(sourceHandle !== undefined && { sourceHandle }),
            ...(targetHandle !== undefined && { targetHandle }),
          },
        ],
      }),
    )
      .then((result) => {
        // À la confirmation seulement : une edge jamais créée n'a rien à
        // annuler, et l'appelant retire déjà la locale en cas d'échec.
        recordUndo(
          { kind: "trashEdges", edgeIds: [edgeId] },
          { kind: "untrashEdges", edgeIds: [edgeId] },
        );
        return result;
      })
      .catch((error: unknown) => {
        toastError(error, "Could not add the connection");
        throw error;
      });
    return { edgeId, settled };
  };

  return { createEdge };
}
