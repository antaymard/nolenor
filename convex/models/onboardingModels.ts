import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import * as CanvasModels from "./canvasModels";
import * as NodeDataModels from "./nodeDataModels";
import * as CanvasNodeModels from "./canvasNodeModels";

type CanvasNode = NonNullable<Doc<"canvases">["nodes"]>[number];

// process.env plutôt que le helper `env` typé de convex.config.ts : cohérent
// avec toute la config de déploiement existante (r2.ts, voice.ts,
// auth.config.ts, chunkBuilder.ts…), qui suit ce pattern partout. Introduire
// le second mécanisme pour une seule variable ajouterait de l'incohérence
// sans bénéfice réel ici.
function readTutorialCanvasId(): Id<"canvases"> | null {
  const raw = process.env.TUTORIAL_CANVAS_ID;
  return raw ? (raw as Id<"canvases">) : null;
}

export async function provisionFirstCanvasForUser(
  ctx: MutationCtx,
  { authUserId }: { authUserId: Id<"users"> },
): Promise<Id<"canvases">> {
  const tutorialCanvasId = readTutorialCanvasId();
  // `.catch` parce qu'un id malformé fait lever `db.get` (un id valide mais
  // supprimé rend simplement `null`) : `TUTORIAL_CANVAS_ID` est collée à la
  // main, une coquille ne doit pas priver le compte de son canvas.
  const tutorialCanvas = tutorialCanvasId
    ? await ctx.db.get("canvases", tutorialCanvasId).catch(() => null)
    : null;

  // Pas de variable configurée, ou pointant sur un canvas supprimé depuis :
  // repli sur le comportement actuel (canvas vide). Le signup ne doit jamais
  // échouer faute de canvas de tuto.
  if (!tutorialCanvas) {
    return await CanvasModels.createCanvasForUser(ctx, {
      authUserId,
      name: "My first canvas",
    });
  }

  return await cloneTutorialCanvas(ctx, { authUserId, tutorialCanvas });
}

async function cloneTutorialCanvas(
  ctx: MutationCtx,
  {
    authUserId,
    tutorialCanvas,
  }: { authUserId: Id<"users">; tutorialCanvas: Doc<"canvases"> },
): Promise<Id<"canvases">> {
  const canvasId = await CanvasModels.createCanvasForUser(ctx, {
    authUserId,
    name: tutorialCanvas.name,
    description: tutorialCanvas.description,
  });

  const sourceNodeDatas = await ctx.db
    .query("nodeDatas")
    .withIndex("by_canvasId", (q) => q.eq("canvasId", tutorialCanvas._id))
    .collect();

  // Les nodes "custom" pointent un nodeTemplates scopé au compte source ; le
  // partage cross-utilisateur de ce lien après clonage n'est pas garanti côté
  // fenêtre (résolution du template, droits d'édition). Hors scope : on les
  // saute plutôt que de cloner un node cassé.
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

  const clonedNodes: CanvasNode[] = (tutorialCanvas.nodes ?? [])
    .filter((node) => !node.nodeDataId || nodeDataIdMap.has(node.nodeDataId))
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

  // Les edges/hotspots référencent les `node.id` locaux (chaînes arbitraires
  // scopées au document canvas), pas des Convex ids : ils survivent tels
  // quels au clonage. Seuls les edges pointant un node sauté ci-dessus sont
  // filtrés.
  const survivingNodeIds = new Set(clonedNodes.map((node) => node.id));
  const clonedEdges = (tutorialCanvas.edges ?? []).filter(
    (edge) =>
      survivingNodeIds.has(edge.source) && survivingNodeIds.has(edge.target),
  );

  const patch: Partial<Doc<"canvases">> = {
    edges: clonedEdges,
    updatedAt: Date.now(),
  };
  if (tutorialCanvas.hotspots) patch.hotspots = tutorialCanvas.hotspots;
  if (tutorialCanvas.slideshows) patch.slideshows = tutorialCanvas.slideshows;

  await ctx.db.patch("canvases", canvasId, patch);

  return canvasId;
}
