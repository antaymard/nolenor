import type { Doc, Id } from "@/../convex/_generated/dataModel";
import type { TemplateField } from "@/../convex/config/fieldConfig";

/** Projection de `nodeTemplates` renvoyée par `api.dataExport.listTemplatesForExport`. */
export type ExportTemplate = {
  _id: Id<"nodeTemplates">;
  name: string;
  titleFieldId?: string;
  fields: TemplateField[];
};

/** Projection de `canvases` renvoyée par `api.dataExport.listCanvasesForExport`. */
export type ExportCanvasSummary = {
  _id: Id<"canvases">;
  name: string;
  description?: string;
  updatedAt: number;
  nodeCount: number;
};

/** Un fichier de l'archive. `path` est relatif à la racine du ZIP. */
export type ExportFile = {
  path: string;
  content: string;
};

export type ExportProgress = {
  /** Canvases entièrement traités. */
  done: number;
  /** Total connu à cet instant — grandit tant que la liste se pagine. */
  total: number;
  /** Nom du canvas en cours, pour l'affichage. */
  currentCanvasName?: string;
  phase: "listing" | "fetching" | "zipping";
};

export type CanvasWithNodeDatas = {
  canvas: Doc<"canvases">;
  nodeDatas: Doc<"nodeDatas">[];
};
