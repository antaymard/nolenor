import { createFileRoute } from "@tanstack/react-router";
import PageHeader from "@/components/app-shell/PageHeader";
import MemoriesPanel from "@/components/settings/memories/MemoriesPanel";

export const Route = createFileRoute("/settings/memories")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <PageHeader
        title="Agent Memory"
        subtitle="What Nolë remembers about you and your canvases. One line is one memory — empty lines are ignored."
      />

      <div className="mt-6 rounded-2xl bg-slate-50 p-3">
        <MemoriesPanel />
      </div>
    </div>
  );
}
