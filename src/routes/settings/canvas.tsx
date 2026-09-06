import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import CanvasBackgroundPanel from "@/components/settings/canvas/CanvasBackgroundPanel";

const canvasSettingsSearchSchema = z.object({
  canvasId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/settings/canvas")({
  component: RouteComponent,
  validateSearch: canvasSettingsSearchSchema,
});

function RouteComponent() {
  const { canvasId } = Route.useSearch();
  return (
    <div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Canvas</h1>
        <i className="text-sm text-muted-foreground not-italic">
          Background color and pattern, shared with everyone who can see the
          canvas. Only canvases you own can be edited.
        </i>
      </div>

      <div className="mt-4 bg-slate-50 rounded p-2">
        <CanvasBackgroundPanel initialCanvasId={canvasId} />
      </div>
    </div>
  );
}
