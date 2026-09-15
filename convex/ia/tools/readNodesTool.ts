import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { type Id } from "../../_generated/dataModel";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import {
  collectMentionedNodeDataIds,
  parseStoredBlockNoteDocument,
} from "../../lib/blockNoteDocument";
import type { MentionInfo } from "../helpers/blockNoteMarkdown";
import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";
import {
  formatTableMarkdown,
  makeNodeDataLLMFriendly,
} from "../helpers/makeNodeDataLLMFriendly";
import { makeCustomNodeDataLLMFriendly } from "../helpers/customTemplateHelpers";
import type { Doc } from "../../_generated/dataModel";
import {
  buildPdfPagesMarkdown,
  buildPdfTocMarkdown,
} from "../helpers/pdfChunkFormatters";
import type { PdfPageChunk } from "../../models/searchableChunkModels";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { buildNodeDataSchemaXml } from "../helpers/nodeDataSchemaXml";
import { isNodeTypeReadableByAgent } from "../../config/nodeConfig";
import { readStoredImages } from "../../lib/storedImages";
import { toModelImageUrl } from "../../lib/imageTransform";
import { EXPLANATION_FIELD, type ToolConfig, toolError } from "./toolHelpers";

const PDF_HINTS = {
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
const MAX_ATTACHED_IMAGES_PER_CALL = 4;

const IMAGE_HINTS = {
  notIndexed:
    "Image content not yet indexed. Raw image URLs are listed below; use view_image if needed.",
  canView: (nodeId: string, count: number) =>
    `${count} image(s) on this node. The description above was written by an indexing pass, not by you. ` +
    `To look at the pixels yourself, re-call read_nodes with viewImages=["${nodeId}"], or call view_image. ` +
    `Do it only when the description is not enough — an attached image costs ~800 tokens on every following step.`,
  notAnImage: "viewImages was provided for a non-image node and was ignored.",
  notMultimodal:
    "viewImages was requested but the current model cannot read images; only the text description is returned.",
  noImages: "viewImages was requested for a node that holds no image.",
  notRead: (nodeIds: string[]) =>
    `viewImages named ${nodeIds.join(", ")}, which ${nodeIds.length > 1 ? "are" : "is"} not in nodeIds and ` +
    `${nodeIds.length > 1 ? "were" : "was"} not read. Add ${nodeIds.length > 1 ? "them" : "it"} to nodeIds to see the image(s).`,
  capped: (attached: number, requested: number) =>
    `Attached ${attached} of ${requested} images (cap ${MAX_ATTACHED_IMAGES_PER_CALL} per call). ` +
    `Re-call read_nodes with viewImages for the rest.`,
} as const;

const TABLE_DEFAULT_ROW_LIMIT = 50;
const TABLE_MAX_ROW_LIMIT = 200;
const TABLE_MAX_CHARS = 60_000;

const TABLE_HINTS = {
  notATable: "tableRows was provided for a non-table node and was ignored.",
  defaultCap: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (default cap: ${TABLE_DEFAULT_ROW_LIMIT}). Use search_canvas for token lookup, or call read_nodes with tableRows=[{nodeId, offset, limit}] or tableRows=[{nodeId, rowIds:[…]}] to target specific rows.`,
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

type TableRowSliceInput = {
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

function buildTableNodeBody(opts: {
  tableValue: unknown;
  rowSlice: TableRowSliceInput | undefined;
  nodeInfoById: Map<string, { type: string; title: string }>;
}): {
  body: string;
  totalRows: number;
  displayedCount: number;
  truncated: boolean;
} {
  const tableValue = (opts.tableValue ?? {}) as TableValueLite;
  const columns = Array.isArray(tableValue.columns) ? tableValue.columns : [];

  const result = formatTableMarkdown(opts.tableValue, {
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
  });

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

export const readNodesToolConfig: ToolConfig = {
  name: "read_nodes",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  mcp: { access: "read" },
};

/**
 * Ce que rend `execute`, et la raison pour laquelle ce n'est plus une chaîne.
 *
 * `text` est le XML, strictement ce qui partait avant. `images` porte les URLs
 * que `toModelOutput` transforme en parts image — le seul chemin par lequel des
 * pixels atteignent le modèle. Le champ `text` n'est pas décoratif : c'est le
 * contrat que lit `flattenToolOutput` côté MCP, dont le transport est textuel.
 */
type ReadNodesOutput = { text: string; images: string[] };

// is v1.0
export default function readNodesTool({
  threadCtx,
  // Défaut `false` : un site d'appel oublié dégrade en texte, il ne casse pas.
  isMultimodal = false,
}: {
  threadCtx: ThreadCtx;
  isMultimodal?: boolean;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "A tool to read multiple nodes from the current canvas and return their nodeData as LLM-friendly XML. " +
      "For image nodes, returns indexed textual image descriptions by default when available. " +
      (isMultimodal
        ? "Pass `viewImages=[nodeId]` to also attach the actual images so you can look at them yourself — " +
          `at most ${MAX_ATTACHED_IMAGES_PER_CALL} per call, and only when the text description is not enough ` +
          "(an attached image costs ~800 tokens on every following step). "
        : "") +
      "For pdf nodes, by default returns a paginated table of contents in markdown ('# Heading [pageNumber]') along with the total page count. " +
      "Pass `pdfPages=[{nodeId, pages:[…]}]` to read the full OCR markdown of specific 1-based pages instead. " +
      "PDF chunks come from cached Mistral OCR; nodes not yet indexed are flagged. " +
      `For table nodes, by default returns the first ${TABLE_DEFAULT_ROW_LIMIT} rows along with column definitions (incl. select options and node references). ` +
      "Pass `tableRows=[{nodeId, offset, limit}]` to paginate or `tableRows=[{nodeId, rowIds:[…]}]` to target specific rows (use after search_canvas to read matched rows).",
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      nodeIds: z
        .array(z.string())
        .min(1)
        .describe("The list of node IDs to read"),
      withPosition: z
        .boolean()
        .optional()
        .describe(
          "Whether to include x/y position and dimensions attributes in each node tag",
        ),
      // Toujours dans le schéma, même quand le modèle ne sait pas lire d'image :
      // le construire conditionnellement ferait inférer une union (ou `any`) à
      // `createTool` pour tout l'input. C'est la `description` qui varie, et
      // l'exécution qui rend un hint quand l'argument ne peut pas être honoré.
      viewImages: z
        .array(z.string())
        .optional()
        .describe(
          "For image nodes only: node IDs whose actual images should be attached to the result " +
            "so you can look at them. Only honored by multimodal models, " +
            `and capped at ${MAX_ATTACHED_IMAGES_PER_CALL} images per call (listed order is the priority). ` +
            "Omit it to get only the indexed text description, which is much cheaper.",
        ),
      pdfPages: z
        .array(
          z.object({
            nodeId: z.string(),
            pages: z.array(z.number().int().positive()).min(1),
          }),
        )
        .optional()
        .describe(
          "For pdf nodes only: request specific 1-based page numbers per nodeId. " +
            "If omitted, the pdf returns its paginated table of contents and a hint.",
        ),
      tableRows: z
        .array(
          z.object({
            nodeId: z.string(),
            offset: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .describe("0-based offset of the first row to return."),
            limit: z
              .number()
              .int()
              .positive()
              .optional()
              .describe(
                `Max rows to return (hard cap ${TABLE_MAX_ROW_LIMIT}). Defaults to ${TABLE_DEFAULT_ROW_LIMIT} when omitted.`,
              ),
            rowIds: z
              .array(z.string().min(1))
              .optional()
              .describe(
                "Specific row IDs to return. When provided, offset/limit are ignored.",
              ),
          }),
        )
        .optional()
        .describe(
          "For table nodes only: paginate rows per nodeId. Use offset/limit for ranges or rowIds for specific rows. " +
            `If omitted, the table returns up to ${TABLE_DEFAULT_ROW_LIMIT} rows with a hint when truncated.`,
        ),
    }),
    execute: async (ctx, input): Promise<ReadNodesOutput> => {
      console.log(
        `🖼️ Reading ${input.nodeIds.length} node(s) from canvas ${canvasId}`,
      );

      try {
        const withPosition = input.withPosition ?? true;
        const { nodes: canvasNodes, edges: canvasEdges } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
          {
            canvasId: canvasId as Id<"canvases">,
          },
        );

        const canvasNodeTypeById = new Map(
          canvasNodes.map((node) => [node.id, node.type]),
        );

        // Types invisibles pour l'agent : un id qui en désigne un est traité
        // comme introuvable. Purement défensif — ni `list_nodes`, ni les
        // mentions, ni le contexte de message ne lui en donnent l'id. Un id
        // absent du canvas passe, pour garder le message d'erreur habituel.
        const requestedNodeIds = input.nodeIds.filter((nodeId) => {
          const type = canvasNodeTypeById.get(nodeId);
          return type === undefined || isNodeTypeReadableByAgent(type);
        });

        const requestedNodeIdSet = new Set(requestedNodeIds);

        const pdfPagesByNodeId = new Map<string, number[]>();
        for (const entry of input.pdfPages ?? []) {
          pdfPagesByNodeId.set(entry.nodeId, entry.pages);
        }

        const tableRowsByNodeId = new Map<string, TableRowSliceInput>();
        for (const entry of input.tableRows ?? []) {
          tableRowsByNodeId.set(entry.nodeId, entry);
        }

        // Ce que le modèle a demandé, et ce qu'on lui accorde vraiment. Les deux
        // sont distincts : `viewImagesSet` sert à signaler un node non-image
        // (comme `pdfPages` sur un node qui n'est pas un pdf), `attachImagesFor`
        // porte le cap. L'ordre donné par le modèle est sa priorité, on le suit.
        const requestedViewImages = (input.viewImages ?? []).filter(
          (nodeId, index, all) => all.indexOf(nodeId) === index,
        );
        const viewImagesSet = new Set(requestedViewImages);
        const attachImagesFor = isMultimodal
          ? new Set(requestedViewImages)
          : new Set<string>();

        // Nodes a read node POINTS AT rather than one that was asked for:
        // `node` table cells, and the mention pills inside blocknote documents.
        // Both need a live `nodeId | type | title` in the output, and both are
        // resolved by the same fetch pass below.
        const referencedNodeIds = new Set<string>();

        // nodeDataId → canvas nodeId, so a mention (which stores the former)
        // can be rendered with the latter — the only id the agent can act on.
        // First placement wins: the same nodeData may sit on the canvas twice.
        const nodeIdByNodeDataId = new Map<string, string>();
        for (const node of canvasNodes) {
          if (node.nodeDataId && !nodeIdByNodeDataId.has(String(node.nodeDataId))) {
            nodeIdByNodeDataId.set(String(node.nodeDataId), node.id);
          }
        }
        const mentionedNodeDataIds = new Set<string>();

        const nodeDataByNodeId = new Map<
          string,
          { type: string; title: string }
        >();

        const baseNodes = await Promise.all(
          requestedNodeIds.map(async (nodeId) => {
            try {
              const { node, nodeData } = await ctx.runQuery(
                internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
                {
                  canvasId: canvasId as Id<"canvases">,
                  nodeId,
                },
              );

              const embed =
                node.type === "embed" &&
                typeof nodeData.values.embed === "object" &&
                nodeData.values.embed !== null
                  ? (nodeData.values.embed as {
                      url?: unknown;
                      embedUrl?: unknown;
                      type?: unknown;
                    })
                  : null;

              if (node.type === "table") {
                const tableValue = (nodeData.values.table ??
                  {}) as TableValueLite;
                const columns = Array.isArray(tableValue.columns)
                  ? tableValue.columns
                  : [];
                const nodeColumnIds = columns
                  .filter((col) => col.type === "node")
                  .map((col) => col.id);
                const rows = Array.isArray(tableValue.rows)
                  ? tableValue.rows
                  : [];
                for (const row of rows) {
                  for (const colId of nodeColumnIds) {
                    const cell = row.cells?.[colId];
                    if (cell && typeof cell === "object") {
                      const refId = (cell as { nodeId?: unknown }).nodeId;
                      if (typeof refId === "string" && refId.length > 0) {
                        referencedNodeIds.add(refId);
                      }
                    }
                  }
                }
              }

              if (node.type === "blocknote") {
                // Parsing the stored document here (rather than waiting for the
                // serializer) is what lets the mentioned nodes join the single
                // fetch pass below instead of costing a round trip each.
                const parsedDoc = parseStoredBlockNoteDocument(nodeData.values.doc);
                if (parsedDoc) {
                  for (const id of collectMentionedNodeDataIds(parsedDoc)) {
                    mentionedNodeDataIds.add(id);
                  }
                }
              }

              return {
                nodeId,
                node,
                nodeData,
                embed,
                error: null as string | null,
              };
            } catch (error) {
              return {
                nodeId,
                node: null,
                nodeData: null,
                embed: null,
                error:
                  error instanceof Error
                    ? error.message
                    : "Unknown node read error",
              };
            }
          }),
        );

        // Templates des custom nodes lus (une seule query, dédupliquée) :
        // titres exacts, contenu par nom de champ et bloc <nodeDataSchemas>.
        const customTemplateIds = [
          ...new Set(
            baseNodes
              .map((entry) => entry.nodeData?.templateId)
              .filter((id): id is Id<"nodeTemplates"> => id !== undefined),
          ),
        ];
        const customTemplates: Doc<"nodeTemplates">[] =
          customTemplateIds.length > 0
            ? await ctx.runQuery(
                internal.wrappers.nodeTemplateWrappers.getTemplates,
                { templateIds: customTemplateIds },
              )
            : [];
        const templatesById = new Map(
          customTemplates.map((template) => [String(template._id), template]),
        );
        const templateForNodeData = (
          nodeData: { templateId?: Id<"nodeTemplates"> } | null | undefined,
        ) =>
          nodeData?.templateId
            ? (templatesById.get(String(nodeData.templateId)) ?? null)
            : null;

        for (const entry of baseNodes) {
          if (entry.nodeData) {
            nodeDataByNodeId.set(entry.nodeId, {
              type: entry.node?.type ?? "unknown",
              title: getNodeDataTitle(
                entry.nodeData,
                templateForNodeData(entry.nodeData),
              ),
            });
          }
        }

        for (const nodeDataId of mentionedNodeDataIds) {
          const nodeId = nodeIdByNodeDataId.get(nodeDataId);
          // No canvas node for it: the mentioned node has been removed. The
          // serializer falls back to the pill's snapshot title on its own.
          if (nodeId) referencedNodeIds.add(nodeId);
        }

        const referencedNodeIdsToFetch = [...referencedNodeIds]
          .filter((id) => !nodeDataByNodeId.has(id))
          .filter((id) => canvasNodeTypeById.has(id));

        await Promise.all(
          referencedNodeIdsToFetch.map(async (refId) => {
            const fallbackType = canvasNodeTypeById.get(refId) ?? "unknown";
            try {
              const { nodeData } = await ctx.runQuery(
                internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
                {
                  canvasId: canvasId as Id<"canvases">,
                  nodeId: refId,
                },
              );
              // A referenced custom node needs its template for the exact same
              // title the user sees on the canvas; without it getNodeDataTitle
              // falls back to a heuristic that can disagree with the pill.
              const template = nodeData.templateId
                ? ((await ctx.runQuery(
                    internal.wrappers.nodeTemplateWrappers.getTemplate,
                    { templateId: nodeData.templateId },
                  )) ?? null)
                : templateForNodeData(nodeData);
              nodeDataByNodeId.set(refId, {
                type: fallbackType,
                title: getNodeDataTitle(nodeData, template),
              });
            } catch {
              nodeDataByNodeId.set(refId, {
                type: fallbackType,
                title: "Untitled",
              });
            }
          }),
        );

        // nodeDataId → what a mention pill pointing at it should render as.
        // Built after the fetch pass so the title is the node's current one,
        // not the snapshot frozen into the pill when it was inserted.
        const mentionInfoByNodeDataId = new Map<string, MentionInfo>();
        for (const nodeDataId of mentionedNodeDataIds) {
          const nodeId = nodeIdByNodeDataId.get(nodeDataId);
          const info = nodeId ? nodeDataByNodeId.get(nodeId) : undefined;
          if (nodeId && info) {
            mentionInfoByNodeDataId.set(nodeDataId, {
              nodeId,
              type: info.type,
              title: info.title,
            });
          }
        }

        const nodes = await Promise.all(
          baseNodes.map(async (entry) => {
            const { nodeId, node, nodeData, embed } = entry;
            let error = entry.error;

            if (error || !node || !nodeData) {
              return {
                nodeId,
                nodeType: canvasNodeTypeById.get(nodeId) ?? "unknown",
                positionX: null as number | null,
                positionY: null as number | null,
                width: null as number | null,
                height: null as number | null,
                title: "Untitled",
                content: "",
                pdfBody: null as string | null,
                pdfTotalPages: null as number | null,
                tableBody: null as string | null,
                tableTotalRows: null as number | null,
                tableDisplayedRows: null as number | null,
                embedUrl: null as string | null,
                embedIframeUrl: null as string | null,
                embedType: null as string | null,
                imageUrls: [] as string[],
                error: error ?? "Unknown node read error",
              };
            }

            // A malformed blocknote document or a jsdom conversion failure must
            // surface as a per-node readError, not fail the whole read_nodes call.
            let content: string;
            try {
              content =
                nodeData.type === "custom"
                  ? await makeCustomNodeDataLLMFriendly(
                      nodeData,
                      templateForNodeData(nodeData),
                    )
                  : await makeNodeDataLLMFriendly(nodeData, {
                      mentions: mentionInfoByNodeDataId,
                    });
            } catch (renderError) {
              content = "";
              error = `Failed to render node content: ${
                renderError instanceof Error
                  ? renderError.message
                  : "Unknown error"
              }`;
            }
            let pdfBody: string | null = null;
            let pdfTotalPages: number | null = null;
            let tableBody: string | null = null;
            let tableTotalRows: number | null = null;
            let tableDisplayedRows: number | null = null;
            let imageUrls: string[] = [];

            if (node.type === "image") {
              // Les URLs vivantes, pas celles des metadata du chunk : celles-ci
              // datent de l'indexation, et pointent dans le vide si l'image a
              // été remplacée depuis.
              const storedImages = readStoredImages(nodeData.values);
              const attach = attachImagesFor.has(nodeId);

              const imageChunks = await ctx.runQuery(
                internal.wrappers.searchableChunkWrappers.listByNodeDataId,
                { nodeDataId: nodeData._id },
              );

              const imageBody = buildImageNodeBody(
                imageChunks.filter((chunk) => chunk.chunkType === "node"),
                { attached: attach },
              );

              // Écraser `content` faisait disparaître `imagePrompt` et
              // `imageIncludeReferences` dès qu'un chunk existait — l'agent
              // réécrivait donc un prompt de génération sans voir l'ancien.
              // On les re-rend ici plutôt que de garder tout `content` : celui-ci
              // liste aussi les images en markdown, ce que `<image url=…>` dit
              // déjà. Les valeurs sont lues comme `values.files` et
              // `values.table` le sont plus bas.
              content = imageBody
                ? [imageBody, renderImageGenerationValues(nodeData.values)]
                    .filter(Boolean)
                    .join("\n")
                : `<imageStatus>${escapeXmlText(IMAGE_HINTS.notIndexed)}</imageStatus>\n${content}`;

              if (attach) {
                imageUrls = storedImages.map((image) => image.url);
                if (imageUrls.length === 0) {
                  content = `<warning>${escapeXmlText(IMAGE_HINTS.noImages)}</warning>\n${content}`;
                }
              } else if (isMultimodal && storedImages.length > 0) {
                // Seulement si le modèle sait lire une image : sinon le hint
                // désigne `viewImages` et `view_image`, dont l'un est ignoré et
                // l'autre même pas enregistré pour lui.
                content = `${content}\n<imageHint>${escapeXmlText(
                  IMAGE_HINTS.canView(nodeId, storedImages.length),
                )}</imageHint>`;
              }
            } else if (viewImagesSet.has(nodeId)) {
              content = `<warning>${escapeXmlText(IMAGE_HINTS.notAnImage)}</warning>\n${content}`;
            }

            if (node.type === "pdf") {
              const files =
                (nodeData.values.files as PdfFile[] | undefined) ?? [];
              const pageChunks = await ctx.runQuery(
                internal.wrappers.searchableChunkWrappers
                  .listPdfPagesByNodeDataId,
                { nodeDataId: nodeData._id },
              );
              const requestedPages = pdfPagesByNodeId.get(nodeId);
              pdfBody = buildPdfNodeBody({
                files,
                pageChunks,
                requestedPages,
              });
              pdfTotalPages = getPdfTotalPages(pageChunks) ?? null;
            } else if (pdfPagesByNodeId.has(nodeId)) {
              content = `<warning>${escapeXmlText(PDF_HINTS.notAPdf)}</warning>\n${content}`;
            }

            if (node.type === "table") {
              const rowSlice = tableRowsByNodeId.get(nodeId);
              const result = buildTableNodeBody({
                tableValue: nodeData.values.table,
                rowSlice,
                nodeInfoById: nodeDataByNodeId,
              });
              tableBody = result.body;
              tableTotalRows = result.totalRows;
              tableDisplayedRows = result.displayedCount;
            } else if (tableRowsByNodeId.has(nodeId)) {
              content = `<warning>${escapeXmlText(TABLE_HINTS.notATable)}</warning>\n${content}`;
            }

            return {
              nodeId,
              nodeType: node.type,
              positionX: Math.trunc(node.position.x),
              positionY: Math.trunc(node.position.y),
              width:
                typeof node.width === "number" ? Math.trunc(node.width) : null,
              height:
                typeof node.height === "number"
                  ? Math.trunc(node.height)
                  : null,
              title: getNodeDataTitle(nodeData),
              content,
              pdfBody,
              pdfTotalPages,
              tableBody,
              tableTotalRows,
              tableDisplayedRows,
              imageUrls,
              embedUrl:
                typeof embed?.url === "string" && embed.url.length > 0
                  ? embed.url
                  : null,
              embedIframeUrl:
                typeof embed?.embedUrl === "string" && embed.embedUrl.length > 0
                  ? embed.embedUrl
                  : null,
              embedType:
                typeof embed?.type === "string" && embed.type.length > 0
                  ? embed.type
                  : null,
              error: null as string | null,
            };
          }),
        );

        const nodeInfoById = new Map<string, { type: string; title: string }>(
          nodes.map((node) => [
            node.nodeId,
            {
              type: node.nodeType,
              title: node.title,
            },
          ]),
        );

        const connectedNodeIdsToFetch = new Set<string>();
        for (const edge of canvasEdges) {
          if (requestedNodeIdSet.has(edge.source)) {
            connectedNodeIdsToFetch.add(edge.target);
          }
          if (requestedNodeIdSet.has(edge.target)) {
            connectedNodeIdsToFetch.add(edge.source);
          }
        }

        const missingNodeIds = [...connectedNodeIdsToFetch].filter(
          (nodeId) => !nodeInfoById.has(nodeId),
        );

        await Promise.all(
          missingNodeIds.map(async (nodeId) => {
            const fallbackType = canvasNodeTypeById.get(nodeId) ?? "unknown";

            try {
              const { nodeData } = await ctx.runQuery(
                internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
                {
                  canvasId: canvasId as Id<"canvases">,
                  nodeId,
                },
              );

              nodeInfoById.set(nodeId, {
                type: fallbackType,
                title: getNodeDataTitle(nodeData),
              });
            } catch {
              nodeInfoById.set(nodeId, {
                type: fallbackType,
                title: "Untitled",
              });
            }
          }),
        );

        const formatConnection = (nodeId: string) => {
          const connectedNode = nodeInfoById.get(nodeId);
          const nodeType = connectedNode?.type ?? "unknown";
          const nodeTitle = connectedNode?.title ?? "Untitled";
          return `${nodeId} | ${nodeType} | ${nodeTitle}`;
        };

        const sourceNodesByNodeId = new Map<string, Array<string>>();
        const targetNodesByNodeId = new Map<string, Array<string>>();

        for (const edge of canvasEdges) {
          if (requestedNodeIdSet.has(edge.target)) {
            const values = sourceNodesByNodeId.get(edge.target) ?? [];
            values.push(formatConnection(edge.source));
            sourceNodesByNodeId.set(edge.target, values);
          }

          if (requestedNodeIdSet.has(edge.source)) {
            const values = targetNodesByNodeId.get(edge.source) ?? [];
            values.push(formatConnection(edge.target));
            targetNodesByNodeId.set(edge.source, values);
          }
        }

        const xml = [
          // One schema/tool descriptor per node type.
          // If multiple nodes share the same type, we expose it only once.
          // This keeps the output compact and avoids redundant instructions.
          ...(() => {
            const uniqueNodeTypes = [
              ...new Set(nodes.map((node) => node.nodeType)),
            ];

            return [
              "<nodes>",
              ...nodes.map(
                ({
                  nodeId,
                  nodeType,
                  positionX,
                  positionY,
                  width,
                  height,
                  title,
                  content,
                  pdfBody,
                  pdfTotalPages,
                  tableBody,
                  tableTotalRows,
                  tableDisplayedRows,
                  embedUrl,
                  embedIframeUrl,
                  embedType,
                  error,
                }) => {
                  const sourceNodes = sourceNodesByNodeId.get(nodeId) ?? [];
                  const targetNodes = targetNodesByNodeId.get(nodeId) ?? [];

                  const positionAttributes =
                    withPosition && positionX !== null && positionY !== null
                      ? `${` x="${String(positionX)}" y="${String(positionY)}"`}${width !== null ? ` width="${String(width)}"` : ""}${height !== null ? ` height="${String(height)}"` : ""}`
                      : "";

                  if (nodeType === "embed") {
                    return `<node id="${nodeId}" type="embed" title="${escapeXmlAttribute(title)}"${embedUrl ? ` url="${escapeXmlAttribute(embedUrl)}"` : ""}${embedIframeUrl ? ` embedUrl="${escapeXmlAttribute(embedIframeUrl)}"` : ""}${embedType ? ` embedType="${escapeXmlAttribute(embedType)}"` : ""}${error ? ` readError="${escapeXmlAttribute(error)}"` : ""}${positionAttributes} />`;
                  }

                  if (nodeType === "pdf" && pdfBody !== null) {
                    const totalPagesAttr =
                      pdfTotalPages !== null
                        ? ` totalPages="${pdfTotalPages}"`
                        : "";
                    return `<node id="${nodeId}" type="pdf" sourceNodes="${escapeXmlAttribute(sourceNodes.join(" ; "))}" targetNodes="${escapeXmlAttribute(targetNodes.join(" ; "))}"${positionAttributes} title="${escapeXmlAttribute(title)}"${totalPagesAttr}>
${error ? `<readError>${escapeXmlText(error)}</readError>\n` : ""}${pdfBody}
</node>`;
                  }

                  if (nodeType === "table" && tableBody !== null) {
                    const totalRowsAttr =
                      tableTotalRows !== null
                        ? ` totalRows="${tableTotalRows}"`
                        : "";
                    const displayedRowsAttr =
                      tableDisplayedRows !== null
                        ? ` displayedRows="${tableDisplayedRows}"`
                        : "";
                    return `<node id="${nodeId}" type="table" sourceNodes="${escapeXmlAttribute(sourceNodes.join(" ; "))}" targetNodes="${escapeXmlAttribute(targetNodes.join(" ; "))}"${positionAttributes} title="${escapeXmlAttribute(title)}"${totalRowsAttr}${displayedRowsAttr}>
${error ? `<readError>${escapeXmlText(error)}</readError>\n` : ""}${tableBody}
</node>`;
                  }

                  return `<node id="${nodeId}" type="${nodeType}" sourceNodes="${escapeXmlAttribute(sourceNodes.join(" ; "))}" targetNodes="${escapeXmlAttribute(targetNodes.join(" ; "))}"${positionAttributes} title="${escapeXmlAttribute(title)}">
    ${error ? `<readError>${escapeXmlText(error)}</readError>` : ""}
${content}
</node>`;
                },
              ),
              "</nodes>",
              "<nodeDataSchemas>",
              // Filtre les vides : un custom node dont le template n'est plus
              // résoluble n'a pas de schéma à publier.
              ...uniqueNodeTypes
                .map((nodeType) =>
                  buildNodeDataSchemaXml(nodeType, customTemplates),
                )
                .filter((entry) => entry.length > 0),
              "</nodeDataSchemas>",
            ];
          })(),
        ].join("\n");

        // Les images, dans l'ordre demandé par le modèle : c'est sa priorité,
        // et si le cap tranche, il tranche dans la queue de SA liste.
        const imagesByNodeId = new Map(
          nodes.map((node) => [node.nodeId, node.imageUrls]),
        );
        const attachments: Array<{ nodeId: string; url: string }> = [];
        let requestedCount = 0;
        for (const nodeId of requestedViewImages) {
          for (const url of imagesByNodeId.get(nodeId) ?? []) {
            requestedCount += 1;
            if (attachments.length < MAX_ATTACHED_IMAGES_PER_CALL) {
              attachments.push({ nodeId, url });
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
          // ne sait pas laquelle vient de quel node. ~15 tokens par image, et ça
          // survit à un fournisseur qui réordonne ou fusionne les parts texte.
          trailer.push(
            `<attachedImages count="${attachments.length}" cap="${MAX_ATTACHED_IMAGES_PER_CALL}">`,
            ...attachments.map(
              ({ nodeId, url }, index) =>
                `${index + 1} | ${nodeId} | ${escapeXmlText(url)}`,
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

        console.log("✅ Node read complete", {
          attachedImages: attachments.length,
        });
        return {
          text: trailer.length > 0 ? `${xml}\n${trailer.join("\n")}` : xml,
          images: attachments.map(({ url }) => toModelImageUrl(url)),
        } satisfies ReadNodesOutput;
      } catch (error) {
        console.error("Read nodes error:", error);
        return {
          text: toolError(
            `Failed to read nodes: ${error instanceof Error ? error.message : "Unknown error"}. Please verify the IDs and try again.`,
          ),
          images: [],
        } satisfies ReadNodesOutput;
      }
    },
    toModelOutput: (_ctx, { output }) => {
      // Sans image, byte-identique à ce qui partait avant. Et surtout pas
      // `error-text` sur le chemin d'erreur : ça changerait la façon dont le
      // composant agent marque le step.
      if (output.images.length === 0) {
        return { type: "text", value: output.text };
      }
      return {
        type: "content",
        value: [
          { type: "text", text: output.text },
          ...output.images.map((url) => ({ type: "image-url" as const, url })),
        ],
      };
    },
  });
}
