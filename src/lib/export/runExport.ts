import type { ConvexReactClient } from "convex/react";
import type { PaginationResult } from "convex/server";
import { zip } from "fflate";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { buildCanvasFiles, buildRootReadme, slugify } from "./buildExportFiles";
import type {
  ExportCanvasSummary,
  ExportFile,
  ExportProgress,
  ExportTemplate,
} from "./types";

/**
 * Export des données utilisateur, assemblé dans le navigateur.
 *
 * Le serveur ne fait que servir des pages (cf. convex/dataExport.ts) : pas de job,
 * pas de fichier temporaire, pas de lien expirant. Le prix à payer est que
 * l'archive tient en mémoire le temps du zip — largement suffisant tant qu'un
 * compte reste de taille humaine, et le découpage ci-dessous (queries paginées
 * d'un côté, rendu pur de l'autre) reste réutilisable tel quel si un export
 * asynchrone devenait un jour nécessaire.
 */

const CANVASES_PER_PAGE = 25;
const NODE_DATAS_PER_PAGE = 50;

type Progress = (progress: ExportProgress) => void;

async function listAllCanvases(
  convex: ConvexReactClient,
  onProgress: Progress,
): Promise<ExportCanvasSummary[]> {
  const canvases: ExportCanvasSummary[] = [];
  let cursor: string | null = null;

  for (;;) {
    // Annotation explicite : sans elle TypeScript boucle sur l'inférence
    // (`cursor` dépend de `result`, qui dépend des args où `cursor` figure).
    const result: PaginationResult<ExportCanvasSummary> = await convex.query(
      api.dataExport.listCanvasesForExport,
      { paginationOpts: { numItems: CANVASES_PER_PAGE, cursor } },
    );
    canvases.push(...result.page);
    onProgress({ done: 0, total: canvases.length, phase: "listing" });

    if (result.isDone) return canvases;
    cursor = result.continueCursor;
  }
}

async function fetchNodeDatas(
  convex: ConvexReactClient,
  canvasId: Id<"canvases">,
): Promise<Doc<"nodeDatas">[]> {
  const nodeDatas: Doc<"nodeDatas">[] = [];
  let cursor: string | null = null;

  for (;;) {
    const result: PaginationResult<Doc<"nodeDatas">> = await convex.query(
      api.dataExport.listNodeDatasForExport,
      { canvasId, paginationOpts: { numItems: NODE_DATAS_PER_PAGE, cursor } },
    );
    nodeDatas.push(...result.page);

    if (result.isDone) return nodeDatas;
    cursor = result.continueCursor;
  }
}

function zipFiles(files: ExportFile[], rootDir: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[`${rootDir}/${file.path}`] = encoder.encode(file.content);
  }

  return new Promise((resolve, reject) => {
    // `zip` (et non `zipSync`) : fflate délègue à des web workers, ce qui
    // évite de figer l'onglet pendant la compression.
    zip(entries, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function downloadZip(data: Uint8Array, filename: string): void {
  // Même pattern de téléchargement que le reste de l'app (ImageNode, PdfNode,
  // export-toolbar-button…) : blob URL, ancre synthétique, révocation.
  const blob = new Blob([data as unknown as BlobPart], {
    type: "application/zip",
  });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

export type RunExportOptions = {
  /** Restreint l'export à ces canvases. Absent = tout le contenu du compte. */
  canvasIds?: Id<"canvases">[];
};

export async function runExport(
  convex: ConvexReactClient,
  { canvasIds }: RunExportOptions,
  onProgress: Progress,
): Promise<{ canvasCount: number; filename: string }> {
  const templates = (await convex.query(
    api.dataExport.listTemplatesForExport,
    {},
  )) as ExportTemplate[];
  const templatesById = new Map(
    templates.map((template) => [template._id as string, template]),
  );

  // En export ciblé on ne connaît pas encore les noms : ils arrivent avec les
  // documents eux-mêmes, un par un.
  const summaries = canvasIds
    ? canvasIds.map((canvasId) => ({ _id: canvasId }))
    : await listAllCanvases(convex, onProgress);

  const files: ExportFile[] = [];
  const canvasNames: string[] = [];

  for (const [index, summary] of summaries.entries()) {
    const canvas = await convex.query(api.dataExport.getCanvasForExport, {
      canvasId: summary._id,
    });

    onProgress({
      done: index,
      total: summaries.length,
      currentCanvasName: canvas.name,
      phase: "fetching",
    });

    const nodeDatas = await fetchNodeDatas(convex, summary._id);
    files.push(
      ...(await buildCanvasFiles(
        { canvas, nodeDatas },
        templatesById,
        index + 1,
      )),
    );
    canvasNames.push(canvas.name);
  }

  const exportedAt = new Date();
  files.push(buildRootReadme(canvasNames, exportedAt));

  onProgress({
    done: summaries.length,
    total: summaries.length,
    phase: "zipping",
  });

  const day = exportedAt.toISOString().slice(0, 10);
  // Un seul canvas exporté : son nom dans le fichier, c'est plus parlant que
  // « nolenor-export » dans un dossier de téléchargements.
  const label =
    canvasIds?.length === 1 && canvasNames[0]
      ? `nolenor-${slugify(canvasNames[0])}-${day}`
      : `nolenor-export-${day}`;

  const data = await zipFiles(files, label);
  downloadZip(data, `${label}.zip`);

  return { canvasCount: summaries.length, filename: `${label}.zip` };
}
