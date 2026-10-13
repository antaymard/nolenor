// Le rendu XML de `read_nodes` : des fonctions (pures, sauf la conversion des
// documents et des cellules rich text par le BlockNote headless) sur les données que
// rend le noyau (`readNodes.ts`). Reprises telles quelles de l'ancien
// `ia/tools/readNodesTool.ts` ; spécification de la sortie : `readNodes.md`.
import type { MentionInfoByNodeDataId } from "../../ia/helpers/blockNoteMarkdown";
import { makeCustomNodeDataLLMFriendly } from "../../ia/helpers/customTemplateHelpers";
import {
  formatTableMarkdown,
  makeNodeDataLLMFriendly,
} from "../../ia/helpers/makeNodeDataLLMFriendly";
import { buildNodeDataSchemaXml } from "../../ia/helpers/nodeDataSchemaXml";
import {
  TRANSCRIPT_HINTS,
  buildTranscriptBody,
  type TranscriptReadStatus,
} from "../../ia/helpers/transcriptFormatters";
import { toModelImageUrl } from "../../lib/imageTransform";
import {
  buildPdfPagesMarkdown,
  buildPdfTocMarkdown,
} from "../../ia/helpers/pdfChunkFormatters";
import {
  renderRichTextCellsAsMarkdown,
  richTextCellKey,
} from "../../ia/helpers/tableRichTextMarkdown";
import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";
import type { PdfPageChunk } from "../../models/searchableChunkModels";
import type {
  Connection,
  NodeRef,
  ReadNode,
  ReadNodesResult,
} from "./readNodes";

/**
 * Le corps d'une frame : la liste des nodes qu'elle contient, déjà dans
 * l'ordre de lecture (cf. le noyau), en coordonnées MONDE. Balise `<child>`
 * et non `<node>` : imbriquer deux `<node>` rendrait la sortie ambiguë à
 * parser.
 */
export function buildFrameNodeBody(
  children: Array<NodeRef & { x: number; y: number }>,
  withPosition: boolean,
): string {
  if (children.length === 0) {
    return '<contents count="0" />';
  }

  const lines = children.map((child) => {
    const positionAttributes = withPosition
      ? ` x="${Math.trunc(child.x)}" y="${Math.trunc(child.y)}"`
      : "";
    return `  <child id="${child.id}" type="${child.type}" title="${escapeXmlAttribute(child.title)}"${positionAttributes} />`;
  });

  return [
    `<contents count="${children.length}">`,
    ...lines,
    "</contents>",
  ].join("\n");
}

export const PDF_HINTS = {
  toc: "Call read_nodes with pdfPages=[{nodeId, pages:[…]}] to read full markdown of specific pages.",
  notIndexed:
    "PDF content not yet indexed (Mistral OCR pending or failed). Files are listed above; retry later.",
  noHeadings:
    "No headings detected in OCR output. Use pdfPages to read pages directly by 1-based page number.",
  truncated:
    "Output truncated: too many pages or characters requested. Re-call with fewer pages.",
  notAPdf: "pdfPages was provided for a non-pdf node and was ignored.",
} as const;

/**
 * Une image attachée coûte ~800 tokens, et un résultat de tool est renvoyé en
 * entrée à CHAQUE step restant du run (`stopWhen: stepCountIs(25)`). Quatre
 * images lues au step 2 se repaient donc une vingtaine de fois. Le cap est la
 * seule borne qui tienne : la transcription, elle, coûte quelques centaines de
 * tokens une fois pour toutes.
 */
export const MAX_ATTACHED_IMAGES_PER_CALL = 4;

export const IMAGE_HINTS = {
  notIndexed:
    "Image content not yet indexed. Raw image URLs are listed below; use view_image if needed.",
  // Émis UNE fois en trailer, jamais par node : le texte était identique à
  // ~60 tokens près par node image lu sans `viewImages`.
  canView: (entries: Array<{ nodeId: string; count: number }>) =>
    `Indexed descriptions only (written by an indexing pass, not seen by you) for ` +
    entries
      .map(
        ({ nodeId, count }) =>
          `${nodeId} (${count} image${count > 1 ? "s" : ""})`,
      )
      .join(", ") +
    `. Re-call with viewImages=[${entries.map(({ nodeId }) => `"${nodeId}"`).join(", ")}] ` +
    `or call view_image for pixels (~800 tokens/step each).`,
  notAnImage: "viewImages was provided for a non-image node and was ignored.",
  notMultimodal:
    "viewImages was requested but the current model cannot read images; only the text description is returned.",
  noImages: "viewImages was requested for a node that holds no image.",
  notRead: (nodeIds: string[]) =>
    `viewImages named ${nodeIds.join(", ")}, which ${nodeIds.length > 1 ? "are" : "is"} not in nodeIds and ` +
    `${nodeIds.length > 1 ? "were" : "was"} not read. Add ${nodeIds.length > 1 ? "them" : "it"} to nodeIds to see the image(s).`,
  capped: (attached: number, requested: number) =>
    `Attached ${attached} of ${requested} images (cap ${MAX_ATTACHED_IMAGES_PER_CALL} per call). ` +
    `Call view_image with a nodeId and offset to see the rest.`,
} as const;

export const TABLE_DEFAULT_ROW_LIMIT = 50;
export const TABLE_MAX_ROW_LIMIT = 200;
export const TABLE_MAX_CHARS = 60_000;

export const TABLE_HINTS = {
  notATable: "tableRows was provided for a non-table node and was ignored.",
  defaultCap: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (default cap: ${TABLE_DEFAULT_ROW_LIMIT}). Use \`nole table\` (bash) to get every row, or call read_nodes with tableRows=[{nodeId, offset, limit}] or tableRows=[{nodeId, rowIds:[…]}] to target specific rows.`,
  hardCap: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (capped at ${TABLE_MAX_ROW_LIMIT}). Re-call with a smaller limit or specific rowIds.`,
  charLimit: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (output truncated at ${TABLE_MAX_CHARS} chars). Re-call with a smaller limit or specific rowIds.`,
  rowIdsNotFound: (missing: string[]) =>
    `Some rowIds were not found and were skipped: ${missing.join(", ")}.`,
} as const;

type PdfFile = { url?: string; filename?: string; mimeType?: string };

type SelectOption = {
  id: string;
  label?: string;
  color?: string;
};

type TableColumnLite = {
  id: string;
  name?: string;
  type?: string;
  options?: Array<SelectOption>;
  isMulti?: boolean;
};

type TableValueLite = {
  columns?: Array<TableColumnLite>;
  rows?: Array<{ id: string; cells?: Record<string, unknown> }>;
};

export type TableRowSliceInput = {
  nodeId: string;
  offset?: number;
  limit?: number;
  rowIds?: string[];
};

type StructuredImageMetadata = {
  url: string;
  filename: string;
  order: number;
  title: string;
  imageType: string;
  summary: string;
  visibleText: string;
  keyFacts: string;
  searchTerms: string[];
  rawText?: string;
};

function renderPdfFiles(files: PdfFile[]): string {
  if (files.length === 0) {
    return "<pdfFiles />";
  }
  const lines = files.map((f) => {
    const filename = f.filename ?? "(no filename)";
    const mimeType = f.mimeType ?? "(no mime type)";
    const url = f.url ?? "";
    return `- ${filename} | ${mimeType} | ${url}`;
  });
  return `<pdfFiles>\n${lines.join("\n")}\n</pdfFiles>`;
}

function renderPdfTocBlock(pageChunks: PdfPageChunk[]): string {
  const toc = buildPdfTocMarkdown(pageChunks);
  const inner = toc.structured
    ? `\n${toc.markdown}\n`
    : escapeXmlText(PDF_HINTS.noHeadings);
  return [
    `<pdfToc totalPages="${toc.totalPages}" structured="${toc.structured}">${inner}</pdfToc>`,
    `<pdfHint>${escapeXmlText(PDF_HINTS.toc)}</pdfHint>`,
  ].join("\n");
}

function renderPdfPagesBlock(
  pageChunks: PdfPageChunk[],
  requestedPages: number[],
): string {
  const result = buildPdfPagesMarkdown(pageChunks, requestedPages);
  const pagesXml = result.pages
    .map((p) => {
      if ("error" in p) {
        return `<pdfPage n="${p.n}" error="page not found" />`;
      }
      const totalAttr =
        typeof p.totalPages === "number" ? ` totalPages="${p.totalPages}"` : "";
      return `<pdfPage n="${p.n}"${totalAttr}>\n${p.markdown}\n</pdfPage>`;
    })
    .join("\n");
  const truncatedHint = result.truncated
    ? `\n<pdfHint>${escapeXmlText(PDF_HINTS.truncated)}</pdfHint>`
    : "";
  return `${pagesXml}${truncatedHint}`;
}

export function buildPdfNodeBody(opts: {
  files: PdfFile[];
  pageChunks: PdfPageChunk[];
  requestedPages: number[] | undefined;
}): string {
  const filesXml = renderPdfFiles(opts.files);

  if (opts.pageChunks.length === 0) {
    return `${filesXml}\n<pdfStatus>${escapeXmlText(PDF_HINTS.notIndexed)}</pdfStatus>`;
  }

  if (!opts.requestedPages) {
    return `${filesXml}\n${renderPdfTocBlock(opts.pageChunks)}`;
  }

  return `${filesXml}\n${renderPdfPagesBlock(opts.pageChunks, opts.requestedPages)}`;
}

export function getPdfTotalPages(pageChunks: PdfPageChunk[]): number | undefined {
  for (const chunk of pageChunks) {
    if (typeof chunk.totalPages === "number") return chunk.totalPages;
  }
  return undefined;
}

function renderTableColumnsBlock(columns: TableColumnLite[]): string {
  if (columns.length === 0) {
    return "<tableColumns />";
  }

  const columnXml = columns.map((col) => {
    const id = escapeXmlAttribute(col.id);
    const name = escapeXmlAttribute(col.name ?? col.id);
    const type = escapeXmlAttribute(col.type ?? "text");
    const isMultiAttr =
      col.type === "select"
        ? ` isMulti="${col.isMulti ? "true" : "false"}"`
        : "";

    if (col.type === "select") {
      const options = col.options ?? [];
      if (options.length === 0) {
        return `  <column id="${id}" name="${name}" type="select"${isMultiAttr} />`;
      }
      const optionsXml = options
        .map((opt) => {
          const optId = escapeXmlAttribute(opt.id);
          const optLabel = escapeXmlAttribute(opt.label ?? opt.id);
          const colorAttr = opt.color
            ? ` color="${escapeXmlAttribute(opt.color)}"`
            : "";
          return `    <option id="${optId}" label="${optLabel}"${colorAttr} />`;
        })
        .join("\n");
      return `  <column id="${id}" name="${name}" type="select"${isMultiAttr}>\n${optionsXml}\n  </column>`;
    }

    return `  <column id="${id}" name="${name}" type="${type}" />`;
  });

  return `<tableColumns>\n${columnXml.join("\n")}\n</tableColumns>`;
}

export async function buildTableNodeBody(opts: {
  tableValue: unknown;
  rowSlice: TableRowSliceInput | undefined;
  nodeInfoById: Map<string, { type: string; title: string }>;
  mentions: MentionInfoByNodeDataId;
}): Promise<{
  body: string;
  totalRows: number;
  displayedCount: number;
  truncated: boolean;
}> {
  const tableValue = (opts.tableValue ?? {}) as TableValueLite;
  const columns = Array.isArray(tableValue.columns) ? tableValue.columns : [];

  const formatOptions = {
    rowSlice: opts.rowSlice
      ? {
          offset: opts.rowSlice.offset,
          limit: opts.rowSlice.limit,
          rowIds: opts.rowSlice.rowIds,
        }
      : undefined,
    nodeInfoById: opts.nodeInfoById,
    defaultRowLimit: TABLE_DEFAULT_ROW_LIMIT,
    maxRowLimit: TABLE_MAX_ROW_LIMIT,
    maxChars: TABLE_MAX_CHARS,
    includeColumnLegend: false,
  };

  // Les cellules rich text sortent en Markdown, avec les jetons que les tools
  // d'écriture acceptent. La conversion est asynchrone (BlockNote headless) et
  // ne vaut que pour les lignes affichées : un premier passage, en texte brut,
  // dit lesquelles ; le second les rend. Le Markdown étant au moins aussi long
  // que le texte brut, le second passage ne peut afficher que ces lignes-là ou
  // moins (troncature au nombre de caractères).
  let result = formatTableMarkdown(opts.tableValue, formatOptions);
  if (columns.some((col) => col.type === "richtext")) {
    // Un échec de jsdom ne doit pas faire échouer tout read_nodes : la table
    // reste lisible, en texte brut.
    const renderedCells = await renderRichTextCellsAsMarkdown(
      opts.tableValue,
      result.displayedRowIds,
      opts.mentions,
    ).catch((error: unknown) => {
      console.error("[read_nodes] rich text cells rendering failed:", error);
      return new Map<string, string>();
    });
    if (renderedCells.size > 0) {
      result = formatTableMarkdown(opts.tableValue, {
        ...formatOptions,
        renderRichTextCell: (rowId, columnId) =>
          renderedCells.get(richTextCellKey(rowId, columnId)),
      });
    }
  }

  const columnsBlock = renderTableColumnsBlock(columns);
  const rowsBlock = `<tableRows>\n${result.markdown}\n</tableRows>`;

  const displayedCount = result.displayedRowIds.length;
  const hints: string[] = [];

  switch (result.truncationReason) {
    case "charLimit":
      hints.push(TABLE_HINTS.charLimit(result.totalRows, displayedCount));
      break;
    case "hardCap":
      hints.push(TABLE_HINTS.hardCap(result.totalRows, displayedCount));
      break;
    case "defaultCap":
      hints.push(TABLE_HINTS.defaultCap(result.totalRows, displayedCount));
      break;
    case null:
      break;
  }

  if (result.missingRowIds.length > 0) {
    hints.push(TABLE_HINTS.rowIdsNotFound(result.missingRowIds));
  }

  const hintsXml = hints
    .map((hint) => `<tableHint>${escapeXmlText(hint)}</tableHint>`)
    .join("\n");

  const body = [columnsBlock, rowsBlock, hintsXml]
    .filter((part) => part.length > 0)
    .join("\n");

  return {
    body,
    totalRows: result.totalRows,
    displayedCount,
    truncated: result.truncated,
  };
}

function parseStructuredImageMetadata(
  metadata: unknown,
): StructuredImageMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;

  const image = (metadata as { image?: unknown }).image;
  if (!image || typeof image !== "object") return null;

  const value = image as {
    url?: unknown;
    filename?: unknown;
    order?: unknown;
    title?: unknown;
    imageType?: unknown;
    summary?: unknown;
    visibleText?: unknown;
    keyFacts?: unknown;
    searchTerms?: unknown;
    rawText?: unknown;
  };

  if (typeof value.url !== "string" || value.url.length === 0) return null;

  const searchTerms = Array.isArray(value.searchTerms)
    ? value.searchTerms.filter(
        (term): term is string => typeof term === "string" && term.length > 0,
      )
    : [];

  return {
    url: value.url,
    filename:
      typeof value.filename === "string" && value.filename.length > 0
        ? value.filename
        : "image",
    order: typeof value.order === "number" ? value.order : 0,
    title: typeof value.title === "string" ? value.title : "UNKNOWN",
    imageType:
      typeof value.imageType === "string" ? value.imageType : "UNKNOWN",
    summary: typeof value.summary === "string" ? value.summary : "UNKNOWN",
    visibleText:
      typeof value.visibleText === "string" ? value.visibleText : "UNKNOWN",
    keyFacts: typeof value.keyFacts === "string" ? value.keyFacts : "UNKNOWN",
    searchTerms,
    rawText: typeof value.rawText === "string" ? value.rawText : undefined,
  };
}

/**
 * Le bloc d'une image, avec ou sans ses pixels joints.
 *
 * `attached` ne garde que `VISIBLE_TEXT` : le modèle voit l'image, donc
 * `SUMMARY`, `KEY_FACTS` et `SEARCH_TERMS` ne lui apprennent plus rien — ils
 * décrivent ce qu'il a sous les yeux. `VISIBLE_TEXT`, lui, reste : c'est une
 * transcription verbatim produite par une passe mono-image dédiée, et un modèle
 * qui regarde une vignette parmi quatre lit moins bien un graphe, un tableau ou
 * une UI dense. C'est aussi ce qui autorise de réduire les pixels envoyés
 * (cf. `lib/imageTransform.ts`).
 */
function formatStructuredImageBlock(
  image: StructuredImageMetadata,
  { attached = false }: { attached?: boolean } = {},
): string {
  const attrs = [
    `url="${escapeXmlAttribute(image.url)}"`,
    `filename="${escapeXmlAttribute(image.filename)}"`,
    `order="${String(image.order)}"`,
    ...(attached ? [`attached="true"`] : []),
  ].join(" ");

  const searchTerms =
    image.searchTerms.length > 0 ? image.searchTerms.join(", ") : "NONE";

  const body = attached
    ? `VISIBLE_TEXT: ${escapeXmlText(image.visibleText)}`
    : [
        `TITLE: ${escapeXmlText(image.title)}`,
        `IMAGE_TYPE: ${escapeXmlText(image.imageType)}`,
        `SUMMARY: ${escapeXmlText(image.summary)}`,
        `VISIBLE_TEXT: ${escapeXmlText(image.visibleText)}`,
        `KEY_FACTS: ${escapeXmlText(image.keyFacts)}`,
        `SEARCH_TERMS: ${escapeXmlText(searchTerms)}`,
      ].join("\n");

  return `<image ${attrs}>\n${body}\n</image>`;
}

/**
 * Les deux valeurs d'un node image qui ne décrivent aucune image : le prompt de
 * génération, et le drapeau qui dit si les images des nodes en entrée servent de
 * références. L'agent doit les voir pour itérer dessus plutôt que les écraser.
 *
 * `imageIncludeReferences` n'est rendu que s'il vaut `false` : l'inclusion est
 * le défaut, et le silence suffit pour le cas nominal.
 */
export function renderImageGenerationValues(values: Record<string, unknown>): string {
  const parts: string[] = [];

  const prompt = values.imagePrompt;
  if (typeof prompt === "string" && prompt.length > 0) {
    parts.push(`<imagePrompt>${escapeXmlText(prompt)}</imagePrompt>`);
  }
  if (values.imageIncludeReferences === false) {
    parts.push(
      `<imageIncludeReferences>false</imageIncludeReferences>`,
    );
  }

  return parts.join("\n");
}

export function buildImageNodeBody(
  chunks: Array<{
    order: number;
    text: string;
    metadata?: Record<string, unknown>;
  }>,
  { attached = false }: { attached?: boolean } = {},
): string | null {
  const parts = chunks
    .sort((a, b) => a.order - b.order)
    .map((chunk) => {
      const image = parseStructuredImageMetadata(chunk.metadata);
      if (image) {
        return formatStructuredImageBlock(image, { attached });
      }

      const trimmedText = chunk.text.trim();
      return trimmedText.length > 0 ? trimmedText : null;
    })
    .filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

export type ReadNodesRenderOptions = {
  withPosition: boolean;
  /** Le modèle sait-il lire une image : sinon `viewImages` n'est pas honoré. */
  isMultimodal: boolean;
  pdfPages?: Array<{ nodeId: string; pages: number[] }>;
  mediaRanges?: Array<{ nodeId: string; startSec: number; endSec: number }>;
  tableRows?: TableRowSliceInput[];
  viewImages?: string[];
  /** Le bloc `<nodeDataSchemas>` (comment écrire chaque type). Défaut : oui. */
  schemas?: boolean;
};

/**
 * Le XML de `read_nodes` (et les URLs des images à joindre), à partir de ce
 * que rend le noyau. Partagé par le tool JSON et par `nole read` : un modèle
 * lit le même format, et peut renvoyer les mêmes blocs aux tools d'écriture.
 */
export async function renderReadNodes(
  result: ReadNodesResult,
  options: ReadNodesRenderOptions,
): Promise<{
  text: string;
  images: string[];
  /** Le `<node>` de chaque node lu, seul : pour une sortie node par node. */
  nodes: Array<{ id: string; xml: string }>;
}> {
  const { withPosition, isMultimodal } = options;

    const pdfPagesByNodeId = new Map<string, number[]>();
    for (const entry of options.pdfPages ?? []) {
      pdfPagesByNodeId.set(entry.nodeId, entry.pages);
    }
    const mediaRangeByNodeId = new Map<
      string,
      { startSec: number; endSec: number }
    >();
    for (const entry of options.mediaRanges ?? []) {
      mediaRangeByNodeId.set(entry.nodeId, {
        startSec: entry.startSec,
        endSec: entry.endSec,
      });
    }
    const tableRowsByNodeId = new Map<string, TableRowSliceInput>();
    for (const entry of options.tableRows ?? []) {
      tableRowsByNodeId.set(entry.nodeId, entry);
    }

    // Ce que le modèle a demandé, et ce qu'on lui accorde vraiment. Les deux
    // sont distincts : `viewImagesSet` sert à signaler un node non-image
    // (comme `pdfPages` sur un node qui n'est pas un pdf), `attachImagesFor`
    // porte le cap. L'ordre donné par le modèle est sa priorité, on le suit.
    const requestedViewImages = (options.viewImages ?? []).filter(
      (nodeId, index, all) => all.indexOf(nodeId) === index,
    );
    const viewImagesSet = new Set(requestedViewImages);
    const attachImagesFor = isMultimodal
      ? new Set(requestedViewImages)
      : new Set<string>();

    const mentions: MentionInfoByNodeDataId = new Map(
      [...result.mentions].map(([nodeDataId, ref]) => [
        nodeDataId,
        { nodeId: ref.id, type: ref.type, title: ref.title },
      ]),
    );

    const renderNode = async (node: ReadNode) => {
      const tag = {
        nodeType: node.type,
        positionX: null as number | null,
        positionY: null as number | null,
        width: null as number | null,
        height: null as number | null,
        frameId: null as string | null,
        color: null as string | null,
        frameBody: null as string | null,
        title: "Untitled",
        content: "",
        pdfBody: null as string | null,
        pdfTotalPages: null as number | null,
        transcriptState: null as TranscriptReadStatus["kind"] | null,
        tableBody: null as string | null,
        tableTotalRows: null as number | null,
        tableDisplayedRows: null as number | null,
        error: null as string | null,
      };
      let images: Array<{ url: string; name: string | null }> = [];
      let storedImageCount = 0;

      if (!node.ok) {
        tag.error = node.error;
        return { node, tag, images, storedImageCount };
      }

      const { nodeData } = node;
      // A malformed blocknote document or a jsdom conversion failure must
      // surface as a per-node readError, not fail the whole read_nodes call.
      let content: string;
      try {
        content =
          nodeData.type === "custom"
            ? await makeCustomNodeDataLLMFriendly(nodeData, node.template)
            : await makeNodeDataLLMFriendly(nodeData, { mentions });
      } catch (renderError) {
        content = "";
        tag.error = `Failed to render node content: ${
          renderError instanceof Error
            ? renderError.message
            : "Unknown error"
        }`;
      }

      if (node.image) {
        // Les URLs vivantes, pas celles des metadata du chunk : celles-ci
        // datent de l'indexation, et pointent dans le vide si l'image a
        // été remplacée depuis.
        const attach = attachImagesFor.has(node.id);
        storedImageCount = node.image.stored.length;
        const imageBody = buildImageNodeBody(node.image.chunks, {
          attached: attach,
        });
        // Les valeurs de génération (prompt, références) sont re-rendues
        // à côté des descriptions : l'agent doit voir l'ancien prompt
        // pour itérer dessus plutôt que l'écraser.
        content = imageBody
          ? [imageBody, renderImageGenerationValues(nodeData.values)]
              .filter(Boolean)
              .join("\n")
          : `<imageStatus>${escapeXmlText(IMAGE_HINTS.notIndexed)}</imageStatus>\n${content}`;

        if (attach) {
          images = node.image.stored.map((image) => ({
            url: image.url,
            name:
              typeof image.filename === "string" &&
              image.filename.length > 0
                ? image.filename
                : null,
          }));
          if (images.length === 0) {
            content = `<warning>${escapeXmlText(IMAGE_HINTS.noImages)}</warning>\n${content}`;
          }
        }
        // Pas de hint `canView` ici : il part une seule fois en trailer,
        // consolidé sur tous les nodes image non-attachés.
      } else if (viewImagesSet.has(node.id)) {
        content = `<warning>${escapeXmlText(IMAGE_HINTS.notAnImage)}</warning>\n${content}`;
      }

      if (node.pdf) {
        tag.pdfBody = buildPdfNodeBody({
          files: node.pdf.files,
          pageChunks: node.pdf.pageChunks,
          requestedPages: pdfPagesByNodeId.get(node.id),
        });
        tag.pdfTotalPages = getPdfTotalPages(node.pdf.pageChunks) ?? null;
      } else if (pdfPagesByNodeId.has(node.id)) {
        content = `<warning>${escapeXmlText(PDF_HINTS.notAPdf)}</warning>\n${content}`;
      }

      if (node.transcript) {
        tag.transcriptState = node.transcript.kind;
        content = `${content}\n${buildTranscriptBody(node.transcript, mediaRangeByNodeId.get(node.id))}`;
      } else if (mediaRangeByNodeId.has(node.id)) {
        content = `<warning>${escapeXmlText(TRANSCRIPT_HINTS.notAnAudio)}</warning>\n${content}`;
      }

      if (node.type === "table") {
        const table = await buildTableNodeBody({
          tableValue: nodeData.values.table,
          rowSlice: tableRowsByNodeId.get(node.id),
          nodeInfoById: result.references,
          mentions,
        });
        tag.tableBody = table.body;
        tag.tableTotalRows = table.totalRows;
        tag.tableDisplayedRows = table.displayedCount;
      } else if (tableRowsByNodeId.has(node.id)) {
        content = `<warning>${escapeXmlText(TABLE_HINTS.notATable)}</warning>\n${content}`;
      }

      tag.positionX = Math.trunc(node.x);
      tag.positionY = Math.trunc(node.y);
      tag.width = node.width !== null ? Math.trunc(node.width) : null;
      tag.height = node.height !== null ? Math.trunc(node.height) : null;
      tag.frameId = node.frameId;
      tag.color = node.color;
      tag.frameBody = node.children
        ? buildFrameNodeBody(node.children, withPosition)
        : null;
      tag.title = node.title;
      tag.content = content;
      return { node, tag, images, storedImageCount };
    };

    const rendered = await Promise.all(result.nodes.map(renderNode));

    // Le label de l'edge en 4ᵉ segment, seulement quand il existe : c'est
    // lui qui dit la relation. `;` et `|` sont les séparateurs de
    // l'attribut — on les neutralise pour ne pas casser le découpage.
    const formatConnections = (connections: Connection[]) =>
      connections
        .map(({ id, type, title, label }) => {
          const labelSegment = label
            ? ` | label: "${label.replace(/[;|]/g, ",")}"`
            : "";
          return `${id} | ${type} | ${title}${labelSegment}`;
        })
        .join(" ; ");

    const nodeXml = ({
      node,
      tag: {
        nodeType,
        positionX,
        positionY,
        width,
        height,
        frameId,
        color,
        frameBody,
        title,
        content,
        pdfBody,
        pdfTotalPages,
        transcriptState,
        tableBody,
        tableTotalRows,
        tableDisplayedRows,
        error,
      },
    }: (typeof rendered)[number]) => {
      const nodeId = node.id;
      const sourceNodes = formatConnections(node.sources);
      const targetNodes = formatConnections(node.targets);

      const positionAttributes =
        withPosition && positionX !== null && positionY !== null
          ? `${` x="${String(positionX)}" y="${String(positionY)}"`}${width !== null ? ` width="${String(width)}"` : ""}${height !== null ? ` height="${String(height)}"` : ""}`
          : "";
      // La couleur se pose avec move_and_style_nodes ; elle doit se relire.
      const frameAttribute = `${frameId ? ` frameId="${frameId}"` : ""}${
        color ? ` color="${escapeXmlAttribute(color)}"` : ""
      }`;

      if (nodeType === "frame" && frameBody !== null) {
        return `<node id="${nodeId}" type="frame" sourceNodes="${escapeXmlAttribute(sourceNodes)}" targetNodes="${escapeXmlAttribute(targetNodes)}"${positionAttributes}${frameAttribute} title="${escapeXmlAttribute(title)}">
${error ? `<readError>${escapeXmlText(error)}</readError>\n` : ""}${frameBody}
</node>`;
      }

      if (nodeType === "pdf" && pdfBody !== null) {
        const totalPagesAttr =
          pdfTotalPages !== null ? ` totalPages="${pdfTotalPages}"` : "";
        return `<node id="${nodeId}" type="pdf" sourceNodes="${escapeXmlAttribute(sourceNodes)}" targetNodes="${escapeXmlAttribute(targetNodes)}"${positionAttributes}${frameAttribute} title="${escapeXmlAttribute(title)}"${totalPagesAttr}>
${error ? `<readError>${escapeXmlText(error)}</readError>\n` : ""}${pdfBody}
</node>`;
      }

      if (nodeType === "table" && tableBody !== null) {
        const totalRowsAttr =
          tableTotalRows !== null ? ` totalRows="${tableTotalRows}"` : "";
        const displayedRowsAttr =
          tableDisplayedRows !== null
            ? ` displayedRows="${tableDisplayedRows}"`
            : "";
        return `<node id="${nodeId}" type="table" sourceNodes="${escapeXmlAttribute(sourceNodes)}" targetNodes="${escapeXmlAttribute(targetNodes)}"${positionAttributes}${frameAttribute} title="${escapeXmlAttribute(title)}"${totalRowsAttr}${displayedRowsAttr}>
${error ? `<readError>${escapeXmlText(error)}</readError>\n` : ""}${tableBody}
</node>`;
      }

      const transcriptAttr =
        transcriptState !== null ? ` transcript="${transcriptState}"` : "";
      return `<node id="${nodeId}" type="${nodeType}" sourceNodes="${escapeXmlAttribute(sourceNodes)}" targetNodes="${escapeXmlAttribute(targetNodes)}"${positionAttributes}${frameAttribute} title="${escapeXmlAttribute(title)}"${transcriptAttr}>
${error ? `<readError>${escapeXmlText(error)}</readError>` : ""}
${content}
</node>`;
    };

    // Un schéma par type de node lu, une seule fois par type.
    const uniqueNodeTypes = [
      ...new Set(rendered.map(({ tag }) => tag.nodeType)),
    ];
    const nodeXmls = rendered.map((entry) => ({
      id: entry.node.id,
      xml: nodeXml(entry),
    }));
    const xml = [
      "<nodes>",
      ...nodeXmls.map(({ xml }) => xml),
      "</nodes>",
      ...(options.schemas === false
        ? []
        : [
            "<nodeDataSchemas>",
            // Filtre les vides : un custom node dont le template n'est plus
            // résoluble n'a pas de schéma à publier.
            ...uniqueNodeTypes
              .map((nodeType) =>
                buildNodeDataSchemaXml(nodeType, result.templates),
              )
              .filter((entry) => entry.length > 0),
            "</nodeDataSchemas>",
          ]),
    ].join("\n");

    // Les images, dans l'ordre demandé par le modèle : c'est sa priorité,
    // et si le cap tranche, il tranche dans la queue de SA liste.
    const imagesByNodeId = new Map(
      rendered.map(({ node, images }) => [node.id, images]),
    );
    const attachments: Array<{
      nodeId: string;
      url: string;
      name: string | null;
    }> = [];
    let requestedCount = 0;
    for (const nodeId of requestedViewImages) {
      for (const image of imagesByNodeId.get(nodeId) ?? []) {
        requestedCount += 1;
        if (attachments.length < MAX_ATTACHED_IMAGES_PER_CALL) {
          attachments.push({ nodeId, url: image.url, name: image.name });
        }
      }
    }

    const trailer: string[] = [];
    if (requestedViewImages.length > 0 && !isMultimodal) {
      trailer.push(
        `<warning>${escapeXmlText(IMAGE_HINTS.notMultimodal)}</warning>`,
      );
    }
    // Un nodeId demandé en `viewImages` mais absent de `nodeIds` ne produit
    // rien du tout : sans ça, le modèle attend des pixels qui n'arrivent
    // jamais et n'a aucun moyen de comprendre pourquoi.
    const notRead = requestedViewImages.filter(
      (nodeId) => !imagesByNodeId.has(nodeId),
    );
    if (notRead.length > 0) {
      trailer.push(
        `<warning>${escapeXmlText(IMAGE_HINTS.notRead(notRead))}</warning>`,
      );
    }
    if (attachments.length > 0) {
      // Le modèle reçoit N parts image sans étiquette : sans ce manifeste il
      // ne sait pas laquelle vient de quel node. Index + nodeId + filename
      // (~15 tokens par image) — pas l'URL, déjà portée par la part image
      // et le bloc `<image>` du node.
      trailer.push(
        `<attachedImages count="${attachments.length}" cap="${MAX_ATTACHED_IMAGES_PER_CALL}">`,
        ...attachments.map(
          ({ nodeId, name }, index) =>
            `${index + 1} | ${nodeId} | ${name ?? "image"}`,
        ),
        "</attachedImages>",
      );
    }
    if (requestedCount > attachments.length) {
      trailer.push(
        `<imageHint>${escapeXmlText(
          IMAGE_HINTS.capped(attachments.length, requestedCount),
        )}</imageHint>`,
      );
    }
    // Un seul hint `canView` pour tous les nodes image lus sans leurs
    // pixels — le texte est identique, le payer une fois suffit. Seulement
    // si le modèle sait lire une image.
    if (isMultimodal) {
      const descriptionOnly = rendered.filter(
        ({ node, storedImageCount }) =>
          node.type === "image" &&
          storedImageCount > 0 &&
          !attachImagesFor.has(node.id),
      );
      if (descriptionOnly.length > 0) {
        trailer.push(
          `<imageHint>${escapeXmlText(
            IMAGE_HINTS.canView(
              descriptionOnly.map(({ node, storedImageCount }) => ({
                nodeId: node.id,
                count: storedImageCount,
              })),
            ),
          )}</imageHint>`,
        );
      }
    }

    return {
      text: trailer.length > 0 ? `${xml}\n${trailer.join("\n")}` : xml,
      images: attachments.map(({ url }) => toModelImageUrl(url)),
      nodes: nodeXmls,
    };
}
