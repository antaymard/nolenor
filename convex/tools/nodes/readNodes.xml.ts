// Le rendu XML de `nole read` : des fonctions (pures, sauf la conversion des
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
  buildTranscriptBody,
  type TranscriptReadStatus,
} from "../../ia/helpers/transcriptFormatters";
import {
  buildPdfPagesMarkdown,
  buildPdfTocMarkdown,
} from "../../ia/helpers/pdfChunkFormatters";
import {
  renderRichTextCellsAsMarkdown,
  richTextCellKey,
} from "../../ia/helpers/tableRichTextMarkdown";
import { isContainerNodeType } from "../../config/nodeConfig";
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
function buildFrameNodeBody(
  children: Array<NodeRef & { x: number; y: number }>,
  withPosition: boolean,
  spaces?: Array<{ id: string; nodeIds: string[] }>,
): string {
  const childLine = (
    child: NodeRef & { x: number; y: number },
    indent: string,
  ) => {
    const positionAttributes = withPosition
      ? ` x="${Math.trunc(child.x)}" y="${Math.trunc(child.y)}"`
      : "";
    return `${indent}<child id="${child.id}" type="${child.type}" title="${escapeXmlAttribute(child.title)}"${positionAttributes} />`;
  };

  // Board : ses espaces, vides compris — une colonne « Done » sans rien
  // dedans est une information —, et dans chacun ses nodes dans l'ordre.
  if (spaces) {
    const byId = new Map(children.map((child) => [child.id, child]));
    const lines = spaces.flatMap((space, i) => {
      const inSpace = space.nodeIds.flatMap((id) => {
        const child = byId.get(id);
        return child ? [childLine(child, "    ")] : [];
      });
      const open = `  <space id="${space.id}" index="${i + 1}" count="${inSpace.length}"`;
      return inSpace.length === 0
        ? [`${open} />`]
        : [`${open}>`, ...inSpace, "  </space>"];
    });
    return [
      `<contents count="${children.length}" spaces="${spaces.length}">`,
      ...lines,
      "</contents>",
    ].join("\n");
  }

  if (children.length === 0) {
    return '<contents count="0" />';
  }
  return [
    `<contents count="${children.length}">`,
    ...children.map((child) => childLine(child, "  ")),
    "</contents>",
  ].join("\n");
}

// Les hints nomment les options de `nole read` : c'est le seul chemin de
// lecture (cf. readNodes.cli.ts).
const PDF_HINTS = {
  toc: "Read the full markdown of specific pages with: nole read --pages 3,4 <nodeId>.",
  notIndexed:
    "PDF content not yet indexed (Mistral OCR pending or failed). Files are listed above; retry later.",
  noHeadings:
    "No headings detected in OCR output. Read pages directly by 1-based number: nole read --pages 1,2 <nodeId>.",
  truncated:
    "Output truncated: too many pages or characters requested. Ask for fewer pages.",
} as const;

const IMAGE_HINTS = {
  notIndexed:
    "Image content not yet indexed. Raw image URLs are listed below; use view_image if needed.",
  // Une fois en trailer, pas par node : le texte est le même pour tous.
  canView: (entries: Array<{ nodeId: string; count: number }>) =>
    `Indexed descriptions only (written by an indexing pass, not seen by you) for ` +
    entries
      .map(
        ({ nodeId, count }) =>
          `${nodeId} (${count} image${count > 1 ? "s" : ""})`,
      )
      .join(", ") +
    `. Call view_image to see the pixels (~800 tokens/step each).`,
} as const;

const TABLE_DEFAULT_ROW_LIMIT = 50;
const TABLE_MAX_ROW_LIMIT = 200;
const TABLE_MAX_CHARS = 60_000;

const TABLE_HINTS = {
  defaultCap: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (default cap: ${TABLE_DEFAULT_ROW_LIMIT}). Every row, for jq/awk: nole table <nodeId>. A slice: nole read --rows <offset>:<limit> <nodeId>, or --row-ids <id,id…>.`,
  hardCap: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (capped at ${TABLE_MAX_ROW_LIMIT}). Ask for a smaller --rows limit or specific --row-ids, or use nole table <nodeId>.`,
  charLimit: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (output truncated at ${TABLE_MAX_CHARS} chars). Ask for a smaller --rows limit or specific --row-ids, or use nole table <nodeId>.`,
  rowIdsNotFound: (missing: string[]) =>
    `Some row ids were not found and were skipped: ${missing.join(", ")}.`,
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

function buildPdfNodeBody(opts: {
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

function getPdfTotalPages(pageChunks: PdfPageChunk[]): number | undefined {
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

async function buildTableNodeBody(opts: {
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
    // Un échec de jsdom ne doit pas faire échouer tout nole read : la table
    // reste lisible, en texte brut.
    const renderedCells = await renderRichTextCellsAsMarkdown(
      opts.tableValue,
      result.displayedRowIds,
      opts.mentions,
    ).catch((error: unknown) => {
      console.error("[nole read] rich text cells rendering failed:", error);
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
 * Le bloc d'une image : sa description indexée (les pixels passent par
 * view_image).
 */
function formatStructuredImageBlock(image: StructuredImageMetadata): string {
  const attrs = [
    `url="${escapeXmlAttribute(image.url)}"`,
    `filename="${escapeXmlAttribute(image.filename)}"`,
    `order="${String(image.order)}"`,
  ].join(" ");

  const searchTerms =
    image.searchTerms.length > 0 ? image.searchTerms.join(", ") : "NONE";

  const body = [
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
function renderImageGenerationValues(values: Record<string, unknown>): string {
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

function buildImageNodeBody(
  chunks: Array<{
    order: number;
    text: string;
    metadata?: Record<string, unknown>;
  }>,
): string | null {
  const parts = chunks
    .sort((a, b) => a.order - b.order)
    .map((chunk) => {
      const image = parseStructuredImageMetadata(chunk.metadata);
      if (image) {
        return formatStructuredImageBlock(image);
      }

      const trimmedText = chunk.text.trim();
      return trimmedText.length > 0 ? trimmedText : null;
    })
    .filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

export type ReadNodesRenderOptions = {
  withPosition: boolean;
  /** Le modèle sait-il lire une image : il a alors view_image, et le hint le dit. */
  isMultimodal: boolean;
  pdfPages?: Array<{ nodeId: string; pages: number[] }>;
  mediaRanges?: Array<{ nodeId: string; startSec: number; endSec: number }>;
  tableRows?: TableRowSliceInput[];
  /** Le bloc `<nodeDataSchemas>` (comment écrire chaque type). Défaut : oui. */
  schemas?: boolean;
};

/**
 * Le XML de `nole read`, à partir de ce que rend le noyau. Les blocs d'un
 * document y sont au format que prennent les tools d'écriture (insert_blocks,
 * replace_block…) : le modèle peut les recopier tels quels.
 */
export async function renderReadNodes(
  result: ReadNodesResult,
  options: ReadNodesRenderOptions,
): Promise<{
  text: string;
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
      let storedImageCount = 0;

      if (!node.ok) {
        tag.error = node.error;
        return { node, tag, storedImageCount };
      }

      const { nodeData } = node;
      // A malformed blocknote document or a jsdom conversion failure must
      // surface as a per-node readError, not fail the whole nole read call.
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
        storedImageCount = node.image.stored.length;
        const imageBody = buildImageNodeBody(node.image.chunks);
        // Les valeurs de génération (prompt, références) sont re-rendues
        // à côté des descriptions : l'agent doit voir l'ancien prompt
        // pour itérer dessus plutôt que l'écraser.
        content = imageBody
          ? [imageBody, renderImageGenerationValues(nodeData.values)]
              .filter(Boolean)
              .join("\n")
          : `<imageStatus>${escapeXmlText(IMAGE_HINTS.notIndexed)}</imageStatus>\n${content}`;
        // Pas de hint `canView` ici : il part une seule fois en trailer.
      }

      if (node.pdf) {
        tag.pdfBody = buildPdfNodeBody({
          files: node.pdf.files,
          pageChunks: node.pdf.pageChunks,
          requestedPages: pdfPagesByNodeId.get(node.id),
        });
        tag.pdfTotalPages = getPdfTotalPages(node.pdf.pageChunks) ?? null;
      }

      if (node.transcript) {
        tag.transcriptState = node.transcript.kind;
        content = `${content}\n${buildTranscriptBody(node.transcript, mediaRangeByNodeId.get(node.id))}`;
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
      }

      tag.positionX = Math.trunc(node.x);
      tag.positionY = Math.trunc(node.y);
      tag.width = node.width !== null ? Math.trunc(node.width) : null;
      tag.height = node.height !== null ? Math.trunc(node.height) : null;
      tag.frameId = node.frameId;
      tag.color = node.color;
      tag.frameBody = node.children
        ? buildFrameNodeBody(node.children, withPosition, node.spaces)
        : null;
      tag.title = node.title;
      tag.content = content;
      return { node, tag, storedImageCount };
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

      if (isContainerNodeType(nodeType) && frameBody !== null) {
        return `<node id="${nodeId}" type="${nodeType}" sourceNodes="${escapeXmlAttribute(sourceNodes)}" targetNodes="${escapeXmlAttribute(targetNodes)}"${positionAttributes}${frameAttribute} title="${escapeXmlAttribute(title)}">
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

    const trailer: string[] = [];
    // Un seul hint `canView` pour tous les nodes image lus — le texte est
    // identique, le payer une fois suffit. Seulement si le modèle sait lire
    // une image (sinon il n'a pas view_image).
    if (isMultimodal) {
      const descriptionOnly = rendered.filter(
        ({ node, storedImageCount }) =>
          node.type === "image" && storedImageCount > 0,
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
      nodes: nodeXmls,
    };
}
