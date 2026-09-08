import { ConvexError, convexToJson } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import * as CanvasModels from "./canvasModels";
import * as NodeDataModels from "./nodeDataModels";
import * as CanvasNodeModels from "./canvasNodeModels";
import * as CanvasEdgeModels from "./canvasEdgeModels";
import {
  readLegacyNodeData,
  resolveLegacyNodeDataId,
} from "../lib/legacyNodeDataReaders";
import { extractR2Keys } from "../lib/r2Keys";

type CanvasNode = NonNullable<Doc<"canvases">["nodes"]>[number];

// Aggregate limits for the ENTIRE signup transaction, not per starter. At most
// 4 canvases + 64 contents + 64 mirrored nodes + 128 edges + 128 R2 refs,
// with 2 MiB of source graph/content before cloning and dual-write amplification.
// Conservative admission limits pending an audit of production starters.
export const STARTER_CLONE_LIMITS = {
  canvases: 4,
  nodes: 64,
  edges: 128,
  nodeDatas: 64,
  r2Refs: 128,
  bytes: 2 * 1024 * 1024,
} as const;

// process.env plutôt que le helper `env` typé de convex.config.ts : cohérent
// avec toute la config de déploiement existante (r2.ts, voice.ts,
// auth.config.ts, chunkBuilder.ts…), qui suit ce pattern partout. Introduire
// le second mécanisme pour une seule variable ajouterait de l'incohérence
// sans bénéfice réel ici.
//
// Liste d'ids séparés par des virgules — tuto, templates, ce qu'on voudra :
//   npx convex env set STARTER_CANVAS_IDS "jd7...,jh2...,jn9..."
//
// L'ORDRE COMPTE : le premier de la liste est estampillé comme le plus
// récemment modifié, donc c'est lui que la home met en avant (« Pick up where
// you left off » lit `ownCanvases[0]`, trié par `by_creator_and_updatedAt`
// desc). Mettre le canvas de tuto en tête.
function readStarterCanvasIds(): Array<Id<"canvases">> {
  const raw = process.env.STARTER_CANVAS_IDS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0) as Array<Id<"canvases">>;
}

/**
 * Clone les canvases de démarrage pour un compte qui vient d'être créé.
 *
 * Rend les ids créés, dans l'ordre de `STARTER_CANVAS_IDS`. Tout est fait
 * dans une seule transaction : soit le compte reçoit son jeu de départ, soit
 * il n'en reçoit aucun et la home affiche son écran de bienvenue, qui sait
 * déjà créer un workspace. Les budgets sont vérifiés avant la création ; un
 * dépassement ou une référence incohérente fait échouer tout le provisionnement.
 */
export async function provisionStarterCanvasesForUser(
  ctx: MutationCtx,
  { authUserId }: { authUserId: Id<"users"> },
): Promise<Array<Id<"canvases">>> {
  const sourceIds = readStarterCanvasIds();
  if (sourceIds.length > STARTER_CLONE_LIMITS.canvases) {
    throw new ConvexError("Starter clone budget exceeded: too many canvases.");
  }
  const now = Date.now();
  const created: Array<Id<"canvases">> = [];
  const sources: Array<{
    source: Doc<"canvases">;
    sourceNodeDatas: Doc<"nodeDatas">[];
    sourceNodes: CanvasNode[];
    updatedAt: number;
  }> = [];
  const used = { nodes: 0, edges: 0, nodeDatas: 0, r2Refs: 0, bytes: 0 };
  const checkBudget = () => {
    for (const key of Object.keys(used) as Array<keyof typeof used>) {
      if (used[key] > STARTER_CLONE_LIMITS[key]) {
        throw new ConvexError(
          `Starter clone budget exceeded: ${key}. No canvases cloned.`,
        );
      }
    }
  };

  for (const [index, sourceId] of sourceIds.entries()) {
    // `.catch` parce qu'un id malformé fait lever `db.get` (un id valide mais
    // supprimé rend simplement `null`) : ces ids sont collés à la main, une
    // coquille dans l'un ne doit pas priver le compte des autres.
    const source = await ctx.db.get("canvases", sourceId).catch(() => null);
    if (!source || source.deletedAt !== undefined) continue;
    used.nodes += source.nodes?.length ?? 0;
    used.edges += source.edges?.length ?? 0;
    used.bytes += new TextEncoder().encode(
      JSON.stringify(convexToJson(source)),
    ).byteLength;
    checkBudget();

    const sourceNodeDatas: Doc<"nodeDatas">[] = [];
    // Incremental admission avoids loading N potentially 1 MiB contents before
    // noticing that their aggregate byte budget was already exceeded.
    for await (const nodeData of ctx.db
      .query("nodeDatas")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", source._id))) {
      used.nodeDatas++;
      used.bytes += new TextEncoder().encode(
        JSON.stringify(convexToJson(nodeData)),
      ).byteLength;
      if (nodeData.type !== "custom")
        used.r2Refs += extractR2Keys(nodeData).length;
      checkBudget();
      sourceNodeDatas.push(nodeData);
    }

    const nodeIds = new Set<string>();
    const placedDataIds = new Set<Id<"nodeDatas">>();
    const sourceNodes: CanvasNode[] = [];
    for (const node of source.nodes ?? []) {
      const nodeDataId = resolveLegacyNodeDataId(ctx, node);
      if (
        nodeIds.has(node.id) ||
        (nodeDataId && placedDataIds.has(nodeDataId))
      ) {
        throw new ConvexError("Ambiguous starter node placement.");
      }
      nodeIds.add(node.id);
      if (nodeDataId) placedDataIds.add(nodeDataId);
      await readLegacyNodeData(ctx, source._id, node);
      const data = node.data ? { ...node.data } : undefined;
      if (data) delete data.nodeDataId;
      sourceNodes.push({ ...node, nodeDataId, data });
    }

    // Preserve the configured order in the home page's recency sort.
    sources.push({
      source,
      sourceNodeDatas,
      sourceNodes,
      updatedAt: now - index,
    });
  }

  for (const source of sources) {
    created.push(
      await cloneCanvasForUser(ctx, {
        authUserId,
        ...source,
      }),
    );
  }

  // Rien de configuré, ou aucun id résolvable : repli sur un canvas vide,
  // comme avant la feature. Le signup ne doit jamais échouer faute de
  // canvases de démarrage.
  //
  // Volontairement SANS `isSystem` : ce canvas ne porte aucun contenu système,
  // c'est un workspace vide identique à celui qu'on obtient en cliquant
  // « Create a workspace ». Le badger induirait l'UI en erreur.
  if (created.length === 0) {
    created.push(
      await CanvasModels.createCanvasForUser(ctx, {
        authUserId,
        name: "My first canvas",
      }),
    );
  }

  return created;
}

async function cloneCanvasForUser(
  ctx: MutationCtx,
  {
    authUserId,
    source,
    sourceNodeDatas,
    sourceNodes,
    updatedAt,
  }: {
    authUserId: Id<"users">;
    source: Doc<"canvases">;
    sourceNodeDatas: Doc<"nodeDatas">[];
    sourceNodes: CanvasNode[];
    updatedAt: number;
  },
): Promise<Id<"canvases">> {
  const canvasId = await CanvasModels.createCanvasForUser(ctx, {
    authUserId,
    name: source.name,
    description: source.description,
  });

  // Les nodes "custom" pointent un nodeTemplates scopé au compte source ; le
  // partage cross-utilisateur de ce lien après clonage n'est pas garanti côté
  // fenêtre (résolution du template, droits d'édition). Hors scope : on les
  // saute plutôt que de cloner un node cassé — et `createNodeData` lèverait
  // de toute façon sur un custom sans templateId.
  const nodeDataIdMap = new Map<Id<"nodeDatas">, Id<"nodeDatas">>();
  for (const nodeData of sourceNodeDatas) {
    if (nodeData.type === "custom") continue;
    const newNodeDataId = await NodeDataModels.createNodeData(ctx, {
      type: nodeData.type,
      values: nodeData.values,
      canvasId,
    });
    nodeDataIdMap.set(nodeData._id, newNodeDataId);
  }

  const clonedNodes: CanvasNode[] = sourceNodes
    .filter(
      (node) =>
        node.type !== "custom" &&
        (!node.nodeDataId || nodeDataIdMap.has(node.nodeDataId)),
    )
    .map((node) => ({
      ...node,
      nodeDataId: node.nodeDataId
        ? nodeDataIdMap.get(node.nodeDataId)
        : undefined,
    }));

  if (clonedNodes.length > 0) {
    await CanvasNodeModels.addCanvasNodes(ctx, {
      canvasId,
      canvasNodes: clonedNodes,
    });
  }

  // Les edges référencent les `node.id` locaux (chaînes arbitraires scopées au
  // document canvas), pas des Convex ids : ils survivent tels quels au
  // clonage. Seuls ceux pointant un node sauté ci-dessus sont filtrés.
  const survivingNodeIds = new Set(clonedNodes.map((node) => node.id));
  const clonedEdges = (source.edges ?? []).filter(
    (edge) =>
      survivingNodeIds.has(edge.source) && survivingNodeIds.has(edge.target),
  );

  if (clonedEdges.length > 0) {
    await CanvasEdgeModels.addCanvasEdges(ctx, {
      canvasId,
      edges: clonedEdges,
    });
  }

  const patch: Partial<Doc<"canvases">> = {
    updatedAt,
    isSystem: true,
  };
  // Dernier write du clonage, donc c'est bien cet `updatedAt` qui reste :
  // `addCanvasNodes` en pose un à `Date.now()` au passage.
  await ctx.db.patch("canvases", canvasId, patch);

  return canvasId;
}
