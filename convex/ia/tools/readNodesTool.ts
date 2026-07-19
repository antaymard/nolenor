import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { type Id } from "../../_generated/dataModel";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";
import {
  formatTableMarkdown,
  makeNodeDataLLMFriendly,
} from "../helpers/makeNodeDataLLMFriendly";
import {
  buildCustomSchemaEntries,
  makeCustomNodeDataLLMFriendly,
} from "../helpers/customTemplateHelpers";
import type { Doc } from "../../_generated/dataModel";
import {
  buildPdfPagesMarkdown,
  buildPdfTocMarkdown,
} from "../helpers/pdfChunkFormatters";
import type { PdfPageChunk } from "../../models/searchableChunkModels";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { nodeDataConfig } from "../../config/nodeConfig";
import { formatZodSchemaAsMinimap } from "../../lib/jsonSchemaMinimap";
import { type ToolConfig, toolError } from "./toolHelpers";

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

const IMAGE_HINTS = {
  notIndexed:
    "Image content not yet indexed. Raw image URLs are listed below; use view_image if needed.",
} as const;

const TABLE_DEFAULT_ROW_LIMIT = 50;
const TABLE_MAX_ROW_LIMIT = 200;
const TABLE_MAX_CHARS = 60_000;

const TABLE_HINTS = {
  notATable: "tableRows was provided for a non-table node and was ignored.",
  defaultCap: (totalRows: number, displayedCount: number) =>
    `Showing ${displayedCount} of ${totalRows} rows (default cap: ${TABLE_DEFAULT_ROW_LIMIT}). Use full_text_search for token lookup, or call read_nodes with tableRows=[{nodeId, offset, limit}] or tableRows=[{nodeId, rowIds:[…]}] to target specific rows.`,
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

export const readNodesToolConfig: ToolConfig = {
  name: "read_nodes",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

function getExpectedNodeDataSchemaString(nodeType: string): string | null {
  if (nodeType === "document" || nodeType === "table") {
    return null;
  }

  const config = nodeDataConfig.find((item) => item.type === nodeType);
  if (!config) {
    return null;
  }

  const schema = config.toolInputSchema ?? config.dataValuesSchema;
  return formatZodSchemaAsMinimap(schema);
}

// is v1.0
export default function readNodesTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "A tool to read multiple nodes from the current canvas and return their nodeData as LLM-friendly XML. " +
      "For image nodes, returns indexed textual image descriptions by default when available. " +
      "For pdf nodes, by default returns a paginated table of contents in markdown ('# Heading [pageNumber]') along with the total page count. " +
      "Pass `pdfPages=[{nodeId, pages:[…]}]` to read the full OCR markdown of specific 1-based pages instead. " +
      "PDF chunks come from cached Mistral OCR; nodes not yet indexed are flagged. " +
      `For table nodes, by default returns the first ${TABLE_DEFAULT_ROW_LIMIT} rows along with column definitions (incl. select options and node references). ` +
      "Pass `tableRows=[{nodeId, offset, limit}]` to paginate or `tableRows=[{nodeId, rowIds:[…]}]` to target specific rows (use after full_text_search to read matched rows).",
    inputSchema: z.object({
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
    execute: async (ctx, input): Promise<string> => {
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

        const requestedNodeIdSet = new Set(input.nodeIds);

        const pdfPagesByNodeId = new Map<string, number[]>();
        for (const entry of input.pdfPages ?? []) {
          pdfPagesByNodeId.set(entry.nodeId, entry.pages);
        }

        const tableRowsByNodeId = new Map<string, TableRowSliceInput>();
        for (const entry of input.tableRows ?? []) {
          tableRowsByNodeId.set(entry.nodeId, entry);
        }

        const referencedNodeIdsForTableCells = new Set<string>();

        const nodeDataByNodeId = new Map<
          string,
          { type: string; title: string }
        >();

        const baseNodes = await Promise.all(
          input.nodeIds.map(async (nodeId) => {
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
                        referencedNodeIdsForTableCells.add(refId);
                      }
                    }
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

        const referencedNodeIdsToFetch = [...referencedNodeIdsForTableCells]
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
              nodeDataByNodeId.set(refId, {
                type: fallbackType,
                title: getNodeDataTitle(nodeData),
              });
            } catch {
              nodeDataByNodeId.set(refId, {
                type: fallbackType,
                title: "Untitled",
              });
            }
          }),
        );

        const nodes = await Promise.all(
          baseNodes.map(async (entry) => {
            const { nodeId, node, nodeData, embed, error } = entry;

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
                error: error ?? "Unknown node read error",
              };
            }

            let content =
              nodeData.type === "custom"
                ? await makeCustomNodeDataLLMFriendly(
                    nodeData,
                    templateForNodeData(nodeData),
                  )
                : await makeNodeDataLLMFriendly(nodeData);
            let pdfBody: string | null = null;
            let pdfTotalPages: number | null = null;
            let tableBody: string | null = null;
            let tableTotalRows: number | null = null;
            let tableDisplayedRows: number | null = null;

            if (node.type === "image") {
              const imageChunks = await ctx.runQuery(
                internal.wrappers.searchableChunkWrappers.listByNodeDataId,
                { nodeDataId: nodeData._id },
              );

              const imageBody = buildImageNodeBody(
                imageChunks.filter((chunk) => chunk.chunkType === "node"),
              );

              if (imageBody) {
                content = imageBody;
              } else {
                content = `<imageStatus>${escapeXmlText(IMAGE_HINTS.notIndexed)}</imageStatus>\n${content}`;
              }
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
                    return `<node id="${nodeId}" type="embed" title="${title}"${embedUrl ? ` url="${embedUrl}"` : ""}${embedIframeUrl ? ` embedUrl="${embedIframeUrl}"` : ""}${embedType ? ` embedType="${embedType}"` : ""}${error ? ` readError="${error}"` : ""}${positionAttributes} />`;
                  }

                  if (nodeType === "pdf" && pdfBody !== null) {
                    const totalPagesAttr =
                      pdfTotalPages !== null
                        ? ` totalPages="${pdfTotalPages}"`
                        : "";
                    return `<node id="${nodeId}" type="pdf" sourceNodes="${sourceNodes.join(" ; ")}" targetNodes="${targetNodes.join(" ; ")}"${positionAttributes} title="${title}"${totalPagesAttr}>
${error ? `<readError>${error}</readError>\n` : ""}${pdfBody}
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
                    return `<node id="${nodeId}" type="table" sourceNodes="${sourceNodes.join(" ; ")}" targetNodes="${targetNodes.join(" ; ")}"${positionAttributes} title="${title}"${totalRowsAttr}${displayedRowsAttr}>
${error ? `<readError>${error}</readError>\n` : ""}${tableBody}
</node>`;
                  }

                  return `<node id="${nodeId}" type="${nodeType}" sourceNodes="${sourceNodes.join(" ; ")}" targetNodes="${targetNodes.join(" ; ")}"${positionAttributes} title="${title}">
    ${error ? `<readError>${error}</readError>` : ""}
${content}
</node>`;
                },
              ),
              "</nodes>",
              "<nodeDataSchemas>",
              ...uniqueNodeTypes.map((nodeType) => {
                if (nodeType === "document") {
                  return '<schema type="document" tools="insert_document_content,string_replace_document_content" />';
                }

                if (nodeType === "table") {
                  return '<schema type="table" tools="table_update_schema,table_insert_rows,table_update_rows,table_delete_rows" />';
                }

                // Custom : une entrée par template présent dans le résultat
                // (le schéma dépend du template, pas du type).
                if (nodeType === "custom") {
                  return buildCustomSchemaEntries(customTemplates).join("\n");
                }

                const toolsAttr =
                  nodeType === "app"
                    ? 'tools="set_node_data,patch_app_node_code"'
                    : 'tool="set_node_data"';

                const schema = getExpectedNodeDataSchemaString(nodeType);
                if (!schema) {
                  return `<schema type="${nodeType}" ${toolsAttr} />`;
                }

                return `<schema type="${nodeType}" ${toolsAttr}>\n${schema}\n</schema>`;
              }),
              "</nodeDataSchemas>",
            ];
          })(),
        ].join("\n");

        console.log("✅ Node read complete");
        return xml;
      } catch (error) {
        console.error("Read nodes error:", error);
        return toolError(
          `Failed to read nodes: ${error instanceof Error ? error.message : "Unknown error"}. Please verify the IDs and try again.`,
        );
      }
    },
  });
}
