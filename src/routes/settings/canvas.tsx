import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import PageHeader from "@/components/app-shell/PageHeader";
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
      <PageHeader
        title="Canvas"
        subtitle="Icon, color, cover image and background, shared with everyone who can see the canvas. Only canvases you own can be edited."
      />

      <div className="mt-6 rounded-2xl bg-slate-50 p-3">
        <CanvasBackgroundPanel initialCanvasId={canvasId} />
      </div>
    </div>
  );
}
