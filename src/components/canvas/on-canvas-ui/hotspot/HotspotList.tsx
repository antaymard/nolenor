import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";
import { useMutation } from "convex/react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useViewport, useReactFlow } from "@xyflow/react";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { Kbd } from "@/components/shadcn/kbd";
import { Plus, Navigation2, RefreshCw, Trash2, MapPin } from "lucide-react";
import { useMemo, useState } from "react";

export default function HotspotList({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const canvas = useCanvasStore((state) => state.canvas);
  const createHotspotMutation = useMutation(api.hotposts.create);
  const updateHotspotMutation = useMutation(api.hotposts.update);
  const removeHotspotMutation = useMutation(api.hotposts.remove);
  const { setViewport } = useReactFlow();
  const viewport = useViewport();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const hotspots = useMemo(() => canvas?.hotspots ?? [], [canvas?.hotspots]);

  const canCreate = title.trim().length > 0 && canvas !== null && !isCreating;

  const createHotspot = async () => {
    if (!canvas || !title.trim()) return;
    setIsCreating(true);
    try {
      await createHotspotMutation({
        canvasId,
        id: crypto.randomUUID(),
        name: title.trim(),
        viewport: { ...viewport },
      });
      setTitle("");
      setIsCreateModalOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const renameHotspot = (id: string, newName: string) => {
    const hotspot = hotspots.find((h) => h.id === id);
    if (!hotspot || !newName.trim()) return;
    void updateHotspotMutation({
      canvasId,
      hotspot: { ...hotspot, name: newName.trim() },
    });
  };

  const recaptureHotspot = (id: string) => {
    const hotspot = hotspots.find((h) => h.id === id);
    if (!hotspot) return;
    void updateHotspotMutation({
      canvasId,
      hotspot: { ...hotspot, viewport: { ...viewport } },
    });
  };

  const gotoHotspot = (id: string) => {
    const hotspot = hotspots.find((h) => h.id === id);
    if (!hotspot) return;
    const v = hotspot.viewport as { x: number; y: number; zoom: number };
    setViewport(v, { duration: 500 });
  };

  return (
    <div className="canvas-ui-container h-80 max-h-[70vh] w-56 flex-col items-stretch overflow-hidden shadow-lg backdrop-blur-sm">
      <div className="flex w-full items-center justify-between border-b px-1 pl-2">
        <h3 className="text-sm font-semibold">Hotspots</h3>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button size="icon" variant="ghost">
              <Plus className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add hotspot</DialogTitle>
              <DialogDescription>
                Name this spot. The current view will be saved as its viewport.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="hotspot-title">Name</Label>
              <Input
                id="hotspot-title"
                placeholder="Intro, Chapter 2…"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreate) {
                    e.preventDefault();
                    void createHotspot();
                  }
                }}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setTitle("");
                  setIsCreateModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void createHotspot()}
                disabled={!canCreate}
              >
                {isCreating ? "Adding…" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="min-h-0 flex-1 w-full">
        {hotspots.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            No hotspot yet. Click + to capture the current view.
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-1">
            {hotspots.map((hotspot, index) => (
              <div
                key={hotspot.id}
                className="group rounded-md border border-transparent p-1.5 transition hover:border-border hover:bg-accent/60"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <InlineEditableText
                    value={hotspot.name}
                    onSave={(newName) => renameHotspot(hotspot.id, newName)}
                    as="span"
                    className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
                    inputClassName="text-xs font-medium text-foreground"
                    placeholder="Untitled hotspot"
                  />
                  {index < 9 && (
                    <Kbd className="ml-auto shrink-0 text-[10px]">
                      Alt+{index + 1}
                    </Kbd>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-0.5 pl-5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    title="Go to hotspot"
                    onClick={() => gotoHotspot(hotspot.id)}
                  >
                    <Navigation2 className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    title="Recapture current view"
                    onClick={() => recaptureHotspot(hotspot.id)}
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5 text-destructive hover:text-destructive"
                    title="Delete"
                    onClick={() =>
                      void removeHotspotMutation({ canvasId, id: hotspot.id })
                    }
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
