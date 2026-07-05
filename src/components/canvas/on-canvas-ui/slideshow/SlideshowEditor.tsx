import type { Id } from "@/../convex/_generated/dataModel";
import { api } from "@/../convex/_generated/api";
import { useMutation } from "convex/react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useReactFlow, useViewport } from "@xyflow/react";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import { Button } from "@/components/shadcn/button";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  RefreshCw,
  Plus,
  Navigation2,
} from "lucide-react";
import { useMemo } from "react";
import { TbArrowLeft } from "react-icons/tb";

export default function SlideshowEditor({
  canvasId,
  slideshowId,
  setLayout,
}: {
  canvasId: Id<"canvases">;
  slideshowId: string;
  setLayout: (layout: string) => void;
}) {
  const canvas = useCanvasStore((state) => state.canvas);
  const updateSlideshowMutation = useMutation(api.slideshows.update);
  const viewport = useViewport();
  const { setViewport } = useReactFlow();

  const slideshow = useMemo(
    () => canvas?.slideshows?.find((s) => s.id === slideshowId) ?? null,
    [canvas?.slideshows, slideshowId],
  );

  const slides = useMemo(() => slideshow?.slides ?? [], [slideshow?.slides]);

  const renameSlideshow = (newName: string) => {
    if (!slideshow || !newName.trim()) return;
    void updateSlideshowMutation({
      canvasId,
      slideshow: { ...slideshow, name: newName.trim() },
    });
  };

  const updateSlides = (
    newSlides: Array<{ name: string; viewport: unknown }>,
  ) => {
    if (!slideshow) return;
    void updateSlideshowMutation({
      canvasId,
      slideshow: { ...slideshow, slides: newSlides },
    });
  };

  const addSlide = () => {
    const name = `Slide ${slides.length + 1}`;
    updateSlides([...slides, { name, viewport: { ...viewport } }]);
  };

  const deleteSlide = (index: number) => {
    updateSlides(slides.filter((_, i) => i !== index));
  };

  const recaptureSlide = (index: number) => {
    const updated = [...slides];
    updated[index] = { ...updated[index], viewport: { ...viewport } };
    updateSlides(updated);
  };

  const moveSlide = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= slides.length) return;
    const updated = [...slides];
    [updated[index], updated[target]] = [updated[target], updated[index]];
    updateSlides(updated);
  };

  const renameSlide = (index: number, newName: string) => {
    if (!newName.trim()) return;
    const updated = [...slides];
    updated[index] = {
      ...updated[index],
      name: newName.trim(),
    };
    updateSlides(updated);
  };

  if (!slideshow) {
    return (
      <div className="canvas-ui-container h-48 w-64 flex-col items-stretch overflow-hidden shadow-lg backdrop-blur-sm">
        <div className="flex-1 p-3 text-sm text-muted-foreground">
          Slideshow not found.
        </div>
      </div>
    );
  }

  return (
    <div className="canvas-ui-container p-0! h-96 max-h-[70vh] w-64 flex-col items-stretch overflow-hidden shadow-lg backdrop-blur-sm">
      <div className="flex w-full items-center justify-between gap-2 border-b">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setLayout("list")}
        >
          <TbArrowLeft size={15} />
        </Button>
        <InlineEditableText
          value={slideshow.name}
          onSave={renameSlideshow}
          as="h3"
          className="min-w-0 flex-1 truncate text-sm font-semibold"
          inputClassName="text-sm font-semibold"
          placeholder="Untitled slideshow"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 w-full pr-1">
        {slides.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            No slides yet. Capture your current view to add one.
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-1">
            {slides.map((slide, index) => (
              <div
                key={`${slide.name}-${index}`}
                className="group rounded-md border border-transparent p-1.5 transition hover:border-border hover:bg-accent/60"
              >
                <InlineEditableText
                  value={slide.name}
                  onSave={(newName) => renameSlide(index, newName)}
                  as="span"
                  className="max-w-40 truncate text-xs font-medium text-foreground"
                  inputClassName="text-xs font-medium text-foreground"
                  placeholder="Untitled slide"
                />
                <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    title="Go to slide"
                    onClick={() => {
                      const v = slide.viewport as {
                        x: number;
                        y: number;
                        zoom: number;
                      };
                      setViewport(v, { duration: 500 });
                    }}
                  >
                    <Navigation2 className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    title="Move up"
                    disabled={index === 0}
                    onClick={() => moveSlide(index, "up")}
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    title="Move down"
                    disabled={index === slides.length - 1}
                    onClick={() => moveSlide(index, "down")}
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5"
                    title="Recapture viewport"
                    onClick={() => recaptureSlide(index)}
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5 text-destructive hover:text-destructive"
                    title="Delete"
                    onClick={() => deleteSlide(index)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-1.5">
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={addSlide}
        >
          <Plus className="mr-1 size-3" />
          Capture current view
        </Button>
      </div>
    </div>
  );
}
