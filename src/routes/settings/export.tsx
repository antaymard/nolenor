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
          Téléchargez vos canvases sous forme d'archive ZIP : un Markdown
          lisible par node, plus le JSON brut à côté pour ne rien perdre. Les
          images, PDF et fichiers audio ne sont pas inclus dans l'archive — ils
          y sont référencés par leur URL.
        </i>
      </div>

      <div className="mt-4 bg-slate-50 rounded p-2">
        <ExportPanel />
      </div>
    </div>
  );
}
