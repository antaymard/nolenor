import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { Id } from "@/../convex/_generated/dataModel";
import CanvasSettingsPage from "@/components/settings/pages/CanvasSettingsPage";

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
    <CanvasSettingsPage canvasId={canvasId as Id<"canvases"> | undefined} />
  );
}
