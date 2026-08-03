import { useState } from "react";
import { useConvex, usePaginatedQuery } from "convex/react";
import toast from "react-hot-toast";
import { TbDownload, TbExclamationCircle } from "react-icons/tb";

import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { toastError } from "@/components/utils/errorUtils";
import { runExport } from "@/lib/export/runExport";
import type { ExportProgress } from "@/lib/export/types";

type Scope = { kind: "all" } | { kind: "canvas"; canvasId: Id<"canvases"> };

function progressLabel(progress: ExportProgress): string {
  switch (progress.phase) {
    case "listing":
      return `Inventaire des canvases (${progress.total})…`;
    case "zipping":
      return "Création de l'archive…";
    case "fetching":
      return `Canvas ${progress.done + 1} / ${progress.total}${
        progress.currentCanvasName ? ` — ${progress.currentCanvasName}` : ""
      }`;
  }
}

export default function ExportPanel() {
  const convex = useConvex();
  const [scope, setScope] = useState<Scope>({ kind: "all" });
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const {
    results: canvases,
    status,
    loadMore,
  } = usePaginatedQuery(api.dataExport.listCanvasesForExport, {}, {
    initialNumItems: 50,
  });

  const isExporting = progress !== null;

  const handleExport = async () => {
    setProgress({ done: 0, total: 0, phase: "listing" });
    try {
      const { canvasCount } = await runExport(
        convex,
        scope.kind === "canvas" ? { canvasIds: [scope.canvasId] } : {},
        setProgress,
      );
      toast.success(
        canvasCount === 1
          ? "Export terminé (1 canvas)"
          : `Export terminé (${canvasCount} canvases)`,
      );
    } catch (error) {
      toastError(error, "L'export a échoué");
    } finally {
      setProgress(null);
    }
  };

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
        <Spinner /> Chargement de vos canvases…
      </div>
    );
  }

  if (canvases.length === 0) {
    return (
      <div className="ml-2 mt-2 flex items-center gap-2">
        <TbExclamationCircle /> Vous n'avez encore aucun canvas à exporter
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      <fieldset className="space-y-2" disabled={isExporting}>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="export-scope"
            className="mt-1"
            checked={scope.kind === "all"}
            onChange={() => setScope({ kind: "all" })}
          />
          <span>
            <span className="font-medium">Tout mon contenu</span>
            <span className="block text-muted-foreground">
              Les {canvases.length} canvases que vous avez créés
              {status === "CanLoadMore" ? " (et plus)" : ""}, avec tous leurs
              nodes.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="export-scope"
            className="mt-1"
            checked={scope.kind === "canvas"}
            onChange={() =>
              setScope({ kind: "canvas", canvasId: canvases[0]._id })
            }
          />
          <span className="w-full">
            <span className="font-medium">Un canvas précis</span>
            {scope.kind === "canvas" && (
              <select
                className="mt-2 block w-full max-w-md rounded-md border border-gray-300 bg-white p-2 text-sm"
                value={scope.canvasId}
                onChange={(event) =>
                  setScope({
                    kind: "canvas",
                    canvasId: event.target.value as Id<"canvases">,
                  })
                }
              >
                {canvases.map((canvas) => (
                  <option key={canvas._id} value={canvas._id}>
                    {canvas.name} ({canvas.nodeCount} node
                    {canvas.nodeCount === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            )}
          </span>
        </label>
      </fieldset>

      {status === "CanLoadMore" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isExporting}
          onClick={() => loadMore(50)}
        >
          Charger plus de canvases
        </Button>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? <Spinner /> : <TbDownload />}
          Exporter
        </Button>
        {progress && (
          <span className="text-sm text-muted-foreground">
            {progressLabel(progress)}
          </span>
        )}
      </div>
    </div>
  );
}
