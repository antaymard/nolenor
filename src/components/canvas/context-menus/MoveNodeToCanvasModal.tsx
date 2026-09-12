import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";
import { useParams } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import { useCanvasHistoryStore } from "@/stores/canvasHistoryStore";

type MoveNodeToCanvasModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeCanvasId: string | null;
  onSuccess?: () => void;
};

export default function MoveNodeToCanvasModal({
  open,
  onOpenChange,
  nodeCanvasId,
  onSuccess,
}: MoveNodeToCanvasModalProps) {
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const moveToCanvas = useMutation(api.nodes.move);
  const userCanvases = useQuery(api.canvases.listUserCanvases);

  const [selectedCanvasId, setSelectedCanvasId] =
    useState<Id<"canvases"> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const targetCanvases = useMemo(
    () => (userCanvases ?? []).filter((canvas) => canvas._id !== canvasId),
    [userCanvases, canvasId],
  );

  useEffect(() => {
    if (!open) {
      setSelectedCanvasId(null);
      setIsSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!nodeCanvasId || !selectedCanvasId) return;

    setIsSubmitting(true);
    try {
      await moveToCanvas({
        nodeIds: [nodeCanvasId],
        targetCanvasId: selectedCanvasId,
      });
      // `moveNodes` supprime pour de bon les connexions incidentes : aucune
      // opération inverse ne les rendrait. Plutôt que de laisser la pile
      // promettre une annulation qu'elle ne tiendrait qu'à moitié, on la vide.
      useCanvasHistoryStore.getState().reset();
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move node to another canvas</DialogTitle>
          <DialogDescription>
            Select a destination canvas, then confirm.
          </DialogDescription>
        </DialogHeader>

        {userCanvases === undefined ? (
          <div className="text-sm text-muted-foreground">
            Loading canvases...
          </div>
        ) : targetCanvases.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No other canvas available.
          </div>
        ) : (
          <ScrollArea className="max-h-72 rounded-md border">
            <div className="p-1">
              {targetCanvases.map((canvas) => (
                <button
                  key={canvas._id}
                  type="button"
                  onClick={() => setSelectedCanvasId(canvas._id)}
                  className={cn(
                    "w-full rounded-sm border px-3 py-2 text-left transition-colors",
                    selectedCanvasId === canvas._id
                      ? "border-slate-400 bg-slate-100"
                      : "border-transparent hover:bg-slate-50",
                  )}
                >
                  <div className="truncate text-sm font-medium">
                    {canvas.name}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={
              isSubmitting ||
              !nodeCanvasId ||
              !selectedCanvasId ||
              targetCanvases.length === 0
            }
          >
            {isSubmitting ? "Moving..." : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
