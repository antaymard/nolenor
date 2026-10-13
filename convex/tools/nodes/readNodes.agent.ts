import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../../ia/agentConfig";
import type { MentionInfoByNodeDataId } from "../../ia/helpers/blockNoteMarkdown";
import { makeCustomNodeDataLLMFriendly } from "../../ia/helpers/customTemplateHelpers";
import { makeNodeDataLLMFriendly } from "../../ia/helpers/makeNodeDataLLMFriendly";
import { buildNodeDataSchemaXml } from "../../ia/helpers/nodeDataSchemaXml";
import {
  TRANSCRIPT_HINTS,
  buildTranscriptBody,
  type TranscriptReadStatus,
} from "../../ia/helpers/transcriptFormatters";
import {
  EXPLANATION_FIELD,
  type ToolConfig,
  toolError,
} from "../../ia/tools/toolHelpers";
import { toModelImageUrl } from "../../lib/imageTransform";
import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";
import { canvasScope } from "../scope";
import { readNodes, type Connection, type ReadNode } from "./readNodes";
import {
  IMAGE_HINTS,
  MAX_ATTACHED_IMAGES_PER_CALL,
  PDF_HINTS,
  TABLE_DEFAULT_ROW_LIMIT,
  TABLE_HINTS,
  TABLE_MAX_ROW_LIMIT,
  buildFrameNodeBody,
  buildImageNodeBody,
  buildPdfNodeBody,
  buildTableNodeBody,
  getPdfTotalPages,
  renderImageGenerationValues,
  type TableRowSliceInput,
} from "./readNodes.xml";

/**
 * Adaptateur agent de `readNodes` : le tool `read_nodes` de Nolë, du worker
 * et du MCP. Traduit l'entrée du modèle (pages, plages, lignes, images à
 * joindre) et rend le résultat du noyau en XML, avec ses plafonds et ses
 * hints.
 */

export const readNodesToolConfig: ToolConfig = {
  name: "read_nodes",
  // Lecture seule : relancer un appel interrompu ne peut rien dupliquer.
  replay: "safe",
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
  const scope = canvasScope({
    userId: threadCtx.authUserId,
    canvasId: threadCtx.canvasId,
  });

  return createTool({
    description:
      "A tool to read multiple nodes from the current canvas and return their nodeData as LLM-friendly XML. " +
      "Each node lists its connections in sourceNodes/targetNodes as 'id | type | title', followed by '| label: \"…\"' when the edge carries a label. " +
      "For image nodes, returns indexed textual image descriptions by default when available. " +
      (isMultimodal
        ? "Pass `viewImages=[nodeId]` to also attach the actual images so you can look at them yourself — " +
          `at most ${MAX_ATTACHED_IMAGES_PER_CALL} per call, and only when the text description is not enough ` +
          "(an attached image costs ~800 tokens on every following step). "
        : "") +
      "For pdf nodes, by default returns a paginated table of contents in markdown ('# Heading [pageNumber]') along with the total page count. " +
      "Pass `pdfPages=[{nodeId, pages:[…]}]` to read the full OCR markdown of specific 1-based pages instead. " +
      "PDF chunks come from cached Mistral OCR; nodes not yet indexed are flagged. " +
      "For audio and video nodes, returns the timestamped transcript ('[m:ss] text' lines) when the user has transcribed the file, preceded by an overview of the recording and split into topic chapters titled '## [m:ss] title' when they exist: in full when short, otherwise an outline with one '[start–end] title — summary' line per chapter. " +
      "Pass `mediaRanges=[{nodeId, startSec, endSec}]` to read the transcript of a time range (e.g. around a search_canvas hit's startSec). " +
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
      mediaRanges: z
        .array(
          z.object({
            nodeId: z.string(),
            startSec: z
              .number()
              .nonnegative()
              .describe("Start of the range, in seconds from the start of the file."),
            endSec: z
              .number()
              .positive()
              .describe("End of the range, in seconds (exclusive)."),
          }),
        )
        .optional()
        .describe(
          "For audio and video nodes only: read the transcript segments of one time range per nodeId. " +
            "If omitted, a transcribed audio or video returns its full transcript when short, or an outline of its chapters.",
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
      try {
        const withPosition = input.withPosition ?? true;
        const result = await readNodes(ctx, scope, input.nodeIds);

        const pdfPagesByNodeId = new Map<string, number[]>();
        for (const entry of input.pdfPages ?? []) {
          pdfPagesByNodeId.set(entry.nodeId, entry.pages);
        }
        const mediaRangeByNodeId = new Map<
          string,
          { startSec: number; endSec: number }
        >();
        for (const entry of input.mediaRanges ?? []) {
          mediaRangeByNodeId.set(entry.nodeId, {
            startSec: entry.startSec,
            endSec: entry.endSec,
          });
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
          const frameAttribute = frameId ? ` frameId="${frameId}"` : "";

          if (nodeType === "frame" && frameBody !== null) {
            return `<node id="${nodeId}" type="frame" sourceNodes="${escapeXmlAttribute(sourceNodes)}" targetNodes="${escapeXmlAttribute(targetNodes)}"${positionAttributes} title="${escapeXmlAttribute(title)}">
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
        const xml = [
          "<nodes>",
          ...rendered.map(nodeXml),
          "</nodes>",
          "<nodeDataSchemas>",
          // Filtre les vides : un custom node dont le template n'est plus
          // résoluble n'a pas de schéma à publier.
          ...uniqueNodeTypes
            .map((nodeType) =>
              buildNodeDataSchemaXml(nodeType, result.templates),
            )
            .filter((entry) => entry.length > 0),
          "</nodeDataSchemas>",
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
