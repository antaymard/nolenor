import toast from "react-hot-toast";
import { toastError } from "@/components/utils/errorUtils";
import { formatNodeReference } from "@/lib/nodeReference";
import { useCanvasStore } from "@/stores/canvasStore";

/**
 * « Copy ID » : copie une référence aux nodes, pensée pour être collée à un
 * agent extérieur branché sur le serveur MCP (cf. `formatNodeReference`).
 * Deux variantes : les ids seuls, ou préfixés du canvas — l'agent n'a alors
 * pas à passer par `list_canvases` pour retrouver où lire.
 */
export function useCopyNodeIdsItems(nodeIds: string[]) {
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const plural = nodeIds.length > 1;

  async function copy(withCanvas: boolean) {
    const value = formatNodeReference({
      nodeIds,
      canvasId: withCanvas ? canvasId : undefined,
    });
    try {
      await navigator.clipboard.writeText(value);
      toast.success(plural ? "Node IDs copied" : "Node ID copied");
    } catch (err) {
      toastError(err, "Failed to copy IDs");
    }
  }

  return {
    label: plural ? "Copy IDs" : "Copy ID",
    items: [
      {
        label: plural ? "Node IDs" : "Node ID",
        onClick: () => copy(false),
      },
      ...(canvasId
        ? [
            {
              label: plural ? "Canvas & node IDs" : "Canvas & node ID",
              onClick: () => copy(true),
            },
          ]
        : []),
    ],
  };
}
