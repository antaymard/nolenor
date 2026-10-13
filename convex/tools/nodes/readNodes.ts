import type { FunctionReturnType } from "convex/server";
import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { isNodeTypeReadableByAgent } from "../../config/nodeConfig";
import { collectTableRichTextMentions } from "../../ia/helpers/tableRichTextMarkdown";
import type { TranscriptReadStatus } from "../../ia/helpers/transcriptFormatters";
import {
  collectMentionedNodeDataIds,
  parseStoredBlockNoteDocument,
} from "../../lib/blockNoteDocument";
import { readStoredImages, type StoredImage } from "../../lib/storedImages";
import { getTranscribableSourceKey } from "../../lib/transcriptChunks";
import type { PdfPageChunk } from "../../models/searchableChunkModels";
import { mapConcurrently, type ToolRunCtx } from "../runtime";
import type { ToolScope } from "../scope";
import type { GraphNode } from "./canvasGraph";
import {
  readNodeContents,
  readNodeTitles,
  type NodeContent,
} from "./nodeContents";

/**
 * Noyau : lire des nodes — leur contenu brut et tout ce qu'il faut pour le
 * rendre (connexions, enfants d'une frame, nodes cités, médias indexés).
 *
 * Rend des données, jamais du texte : convertir un document BlockNote,
 * paginer une table ou un PDF, plafonner des images, c'est l'adaptateur. Un
 * CLI et le tool JSON n'en feront pas le même rendu.
 *
 * Lectures bornées : la structure du canvas d'un bloc, les contenus par lots
 * (cf. `runtime.ts`), les médias node par node.
 */

/** Un node cité : par une connexion, une mention, une cellule, une frame. */
export type NodeRef = { id: string; type: string; title: string };

export type Connection = NodeRef & { label: string | null };

type ImageChunk = FunctionReturnType<
  typeof internal.wrappers.searchableChunkWrappers.listByNodeDataId
>[number];

export type ReadNode = {
  id: string;
  /** Les edges qui arrivent à ce node, puis celles qui en partent. */
  sources: Connection[];
  targets: Connection[];
} & (
  | {
      ok: false;
      /** Celui du canvas, `unknown` pour un id introuvable. */
      type: string;
      error: string;
    }
  | {
      ok: true;
      type: string;
      title: string;
      x: number;
      y: number;
      width: number | null;
      height: number | null;
      frameId: string | null;
      color: string | null;
      nodeData: Doc<"nodeDatas">;
      template: Doc<"nodeTemplates"> | null;
      /** Frame : ses enfants lisibles, dans l'ordre de lecture (y puis x). */
      children?: Array<NodeRef & { x: number; y: number }>;
      /** Image : les images stockées, et leurs descriptions indexées. */
      image?: { stored: StoredImage[]; chunks: ImageChunk[] };
      /** PDF : les fichiers, et leurs pages OCR indexées. */
      pdf?: {
        files: Array<{ url?: string; filename?: string; mimeType?: string }>;
        pageChunks: PdfPageChunk[];
      };
      /** Audio, vidéo : le transcript du fichier courant, ou pourquoi il n'y en a pas. */
      transcript?: TranscriptReadStatus;
    }
);

export type ReadNodesResult = {
  /** Dans l'ordre demandé, doublons compris ; sans les types invisibles pour l'agent. */
  nodes: ReadNode[];
  /** Les nodes que les contenus citent par leur id (cellules `node` des tables). */
  references: Map<string, NodeRef>;
  /** Les nodes que les mentions citent, par nodeDataId (c'est ce qu'une mention stocke). */
  mentions: Map<string, NodeRef>;
  /** Les templates des custom nodes lus. */
  templates: Doc<"nodeTemplates">[];
};

export async function readNodes(
  ctx: ToolRunCtx,
  scope: ToolScope,
  nodeIds: readonly string[],
): Promise<ReadNodesResult> {
  const graph = await ctx.runQuery(internal.tools.nodes.canvasGraph.load, {
    scope,
  });
  const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  // Types invisibles pour l'agent : un id qui en désigne un est ignoré. Un id
  // absent du canvas (ou du scope) passe, pour rendre son erreur.
  const requested = nodeIds.filter((nodeId) => {
    const type = graphNodeById.get(nodeId)?.type;
    return type === undefined || isNodeTypeReadableByAgent(type);
  });

  // Un blocknote en édition collaborative a ses dernières frappes dans son
  // doc vivant, recopiées dans `values.doc` par lots : la recopie en attente
  // est faite avant de lire (cf. blocknoteLiveDoc.catchUpCanvasNodes).
  const blocknoteIds = requested.filter(
    (nodeId) => graphNodeById.get(nodeId)?.type === "blocknote",
  );
  if (blocknoteIds.length > 0) {
    await ctx.runMutation(internal.blocknoteLiveDoc.catchUpCanvasNodes, {
      canvasId: scope.canvasId,
      nodeIds: blocknoteIds,
    });
  }

  const contents = await readNodeContents(ctx, scope, requested);

  // Les enfants lisibles de chaque frame, sur la structure déjà en main.
  const childrenByFrameId = new Map<string, GraphNode[]>();
  for (const node of graph.nodes) {
    if (!node.frameId || !isNodeTypeReadableByAgent(node.type)) continue;
    const siblings = childrenByFrameId.get(node.frameId);
    if (siblings) siblings.push(node);
    else childrenByFrameId.set(node.frameId, [node]);
  }

  // nodeDataId → nodeId : une mention stocke le premier, l'agent n'agit que
  // sur le second. Premier placement gagnant : un même nodeData peut être
  // deux fois sur le canvas.
  const nodeIdByNodeDataId = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.nodeDataId && !nodeIdByNodeDataId.has(node.nodeDataId)) {
      nodeIdByNodeDataId.set(node.nodeDataId, node.id);
    }
  }

  // Tout ce que les nodes lus citent : leurs titres viennent d'une seule
  // passe, après coup.
  const cited = new Set<string>();
  const mentionedNodeDataIds = new Set<string>();
  for (const content of contents) {
    if (!content.ok) continue;
    const { nodeData } = content;
    if (content.type === "table") {
      collectTableReferences(nodeData.values.table, cited, mentionedNodeDataIds);
    }
    if (content.type === "blocknote") {
      const doc = parseStoredBlockNoteDocument(nodeData.values.doc);
      for (const id of doc ? collectMentionedNodeDataIds(doc) : []) {
        mentionedNodeDataIds.add(id);
      }
    }
    if (content.type === "frame") {
      for (const child of childrenByFrameId.get(content.id) ?? []) {
        cited.add(child.id);
      }
    }
  }
  for (const nodeDataId of mentionedNodeDataIds) {
    const nodeId = nodeIdByNodeDataId.get(nodeDataId);
    // Pas de node : la mention vise un node supprimé, ou hors scope. Le rendu
    // retombe sur le titre figé dans la pastille.
    if (nodeId) cited.add(nodeId);
  }
  const requestedSet = new Set(requested);
  for (const edge of graph.edges) {
    if (requestedSet.has(edge.source)) cited.add(edge.target);
    if (requestedSet.has(edge.target)) cited.add(edge.source);
  }

  // Les nodes lus se citent avec leur propre titre ; les autres, lus ici.
  const known = new Map<string, NodeRef>();
  for (const content of contents) {
    known.set(
      content.id,
      content.ok
        ? { id: content.id, type: content.type, title: content.title }
        : {
            id: content.id,
            type: graphNodeById.get(content.id)?.type ?? "unknown",
            title: "Untitled",
          },
    );
  }
  const toFetch = [...cited].filter(
    (id) => !known.has(id) && graphNodeById.has(id),
  );
  const fetched = await readNodeTitles(ctx, scope, toFetch);
  const refOf = (id: string): NodeRef | undefined => {
    const own = known.get(id);
    if (own) return own;
    const graphNode = graphNodeById.get(id);
    if (!graphNode) return undefined;
    return {
      id,
      type: graphNode.type,
      title: fetched.get(id)?.title ?? "Untitled",
    };
  };

  const references = new Map<string, NodeRef>();
  for (const id of cited) {
    const ref = refOf(id);
    if (ref) references.set(id, ref);
  }
  for (const content of contents) {
    if (content.ok) references.set(content.id, known.get(content.id)!);
  }

  const mentions = new Map<string, NodeRef>();
  for (const nodeDataId of mentionedNodeDataIds) {
    const nodeId = nodeIdByNodeDataId.get(nodeDataId);
    const ref = nodeId ? refOf(nodeId) : undefined;
    if (ref) mentions.set(nodeDataId, ref);
  }

  const connectionsOf = (nodeId: string) => {
    const sources: Connection[] = [];
    const targets: Connection[] = [];
    const ref = (id: string) =>
      refOf(id) ?? { id, type: "unknown", title: "Untitled" };
    for (const edge of graph.edges) {
      if (edge.target === nodeId) {
        sources.push({ ...ref(edge.source), label: edge.label });
      }
      if (edge.source === nodeId) {
        targets.push({ ...ref(edge.target), label: edge.label });
      }
    }
    return { sources, targets };
  };

  // Un id demandé deux fois n'est lu qu'une fois (médias compris) ; les
  // lectures de médias, une requête par node, sont bornées en concurrence.
  const uniqueContents = [
    ...new Map(contents.map((content) => [content.id, content])).values(),
  ];
  const readById = new Map<string, ReadNode>();
  await mapConcurrently(uniqueContents, async (content) => {
    readById.set(content.id, await readOne(content));
  });
  const nodes = contents.map((content) => readById.get(content.id)!);

  async function readOne(content: NodeContent): Promise<ReadNode> {
    const connections = connectionsOf(content.id);
    if (!content.ok) {
      return {
        id: content.id,
        ok: false,
        type: graphNodeById.get(content.id)?.type ?? "unknown",
        error: content.error,
        ...connections,
      };
    }
    const graphNode = graphNodeById.get(content.id)!;
    const { nodeData } = content;
    return {
      id: content.id,
      ok: true,
      type: content.type,
      title: content.title,
      x: graphNode.x,
      y: graphNode.y,
      width: graphNode.width,
      height: graphNode.height,
      frameId: graphNode.frameId,
      color: graphNode.color,
      nodeData,
      template: content.template,
      ...connections,
      ...(content.type === "frame" && {
        children: [...(childrenByFrameId.get(content.id) ?? [])]
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((child) => ({ ...refOf(child.id)!, x: child.x, y: child.y })),
      }),
      ...(content.type === "image" && {
        image: {
          stored: readStoredImages(nodeData.values),
          chunks: (
            await ctx.runQuery(
              internal.wrappers.searchableChunkWrappers.listByNodeDataId,
              { nodeDataId: nodeData._id },
            )
          ).filter((chunk) => chunk.chunkType === "node"),
        },
      }),
      ...(content.type === "pdf" && {
        pdf: {
          files:
            (nodeData.values.files as
              | Array<{ url?: string; filename?: string; mimeType?: string }>
              | undefined) ?? [],
          pageChunks: await ctx.runQuery(
            internal.wrappers.searchableChunkWrappers.listPdfPagesByNodeDataId,
            { nodeDataId: nodeData._id },
          ),
        },
      }),
      ...(await readTranscript(ctx, nodeData)),
    };
  }

  const templates: Doc<"nodeTemplates">[] = [];
  for (const content of contents) {
    if (
      content.ok &&
      content.template &&
      !templates.some((template) => template._id === content.template!._id)
    ) {
      templates.push(content.template);
    }
  }

  return { nodes, references, mentions, templates };
}

/** Les nodes qu'une table cite : cellules `node`, mentions des cellules rich text. */
function collectTableReferences(
  table: unknown,
  nodeIds: Set<string>,
  mentionedNodeDataIds: Set<string>,
) {
  const value = (table ?? {}) as {
    columns?: Array<{ id: string; type?: string }>;
    rows?: Array<{ cells?: Record<string, unknown> }>;
  };
  const nodeColumnIds = (Array.isArray(value.columns) ? value.columns : [])
    .filter((column) => column.type === "node")
    .map((column) => column.id);
  for (const row of Array.isArray(value.rows) ? value.rows : []) {
    for (const columnId of nodeColumnIds) {
      const cell = row.cells?.[columnId];
      const refId =
        cell && typeof cell === "object"
          ? (cell as { nodeId?: unknown }).nodeId
          : undefined;
      if (typeof refId === "string" && refId.length > 0) nodeIds.add(refId);
    }
  }
  for (const id of collectTableRichTextMentions(table)) {
    mentionedNodeDataIds.add(id);
  }
}

/**
 * Le transcript du fichier courant d'un audio ou d'une vidéo. Un statut ne
 * vaut que pour le fichier courant ; un transcript existant prime (une
 * re-transcription en cours laisse l'ancien lisible).
 */
async function readTranscript(
  ctx: ToolRunCtx,
  nodeData: Doc<"nodeDatas">,
): Promise<{ transcript?: TranscriptReadStatus }> {
  const sourceKey = getTranscribableSourceKey(nodeData);
  if (!sourceKey) return {};
  const transcript = await ctx.runQuery(
    internal.wrappers.searchableChunkWrappers.getCurrentTranscript,
    { nodeDataId: nodeData._id },
  );
  const pending =
    nodeData.transcription?.sourceKey === sourceKey
      ? nodeData.transcription
      : undefined;
  return {
    transcript: transcript
      ? { kind: "complete", transcript }
      : pending?.status === "running"
        ? { kind: "running" }
        : pending?.status === "error"
          ? { kind: "error", error: pending.error ?? "Unknown error." }
          : { kind: "none" },
  };
}
