import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../../ia/agentConfig";
import {
  EXPLANATION_FIELD,
  type ToolConfig,
  toolError,
} from "../../ia/tools/toolHelpers";
import { canvasScope } from "../scope";
import { readNodes } from "./readNodes";
import {
  MAX_ATTACHED_IMAGES_PER_CALL,
  TABLE_DEFAULT_ROW_LIMIT,
  TABLE_MAX_ROW_LIMIT,
  renderReadNodes,
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
      "Pass `mediaRanges=[{nodeId, startSec, endSec}]` to read the transcript of a time range (e.g. around a `nole search` hit's timestamp). " +
      `For table nodes, by default returns the first ${TABLE_DEFAULT_ROW_LIMIT} rows along with column definitions (incl. select options and node references). ` +
      "Pass `tableRows=[{nodeId, offset, limit}]` to paginate or `tableRows=[{nodeId, rowIds:[…]}]` to target specific rows (use after `nole search` to read matched rows; `nole table` prints every row).",
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
        const result = await readNodes(ctx, scope, input.nodeIds);
        const { text, images } = await renderReadNodes(result, {
          withPosition: input.withPosition ?? true,
          isMultimodal,
          pdfPages: input.pdfPages,
          mediaRanges: input.mediaRanges,
          tableRows: input.tableRows,
          viewImages: input.viewImages,
        });
        return { text, images };
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
