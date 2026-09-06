import { createFileRoute } from "@tanstack/react-router";
import MemoriesPanel from "@/components/settings/memories/MemoriesPanel";

export const Route = createFileRoute("/settings/memories")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Agent Memory</h1>
        <i className="text-sm text-muted-foreground not-italic">
          What Nolë remembers about you and your canvases. One line is one
          memory — empty lines are ignored.
        </i>
      </div>

      <div className="mt-4 bg-slate-50 rounded p-2">
        <MemoriesPanel />
      </div>
    </div>
  );
}
