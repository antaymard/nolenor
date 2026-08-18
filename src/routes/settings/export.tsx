import { createFileRoute } from "@tanstack/react-router";
import ExportPanel from "@/components/settings/export/ExportPanel";

export const Route = createFileRoute("/settings/export")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Export my data</h1>
        <i className="text-sm text-muted-foreground not-italic">
          Download your canvases as a ZIP archive: one readable Markdown file
          per node, with the raw JSON next to it so nothing is lost. Images,
          PDFs and audio files are not bundled in — the archive references them
          by URL.
        </i>
      </div>

      <div className="mt-4 bg-slate-50 rounded p-2">
        <ExportPanel />
      </div>
    </div>
  );
}
