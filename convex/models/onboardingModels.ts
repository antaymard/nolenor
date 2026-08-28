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
 * déjà créer un workspace. Une liste déraisonnablement longue se heurterait
 * aux limites de transaction Convex — l'échec serait propre (rien de
 * committé), pas un demi-jeu.
 */
export async function provisionStarterCanvasesForUser(
  ctx: MutationCtx,
  { authUserId }: { authUserId: Id<"users"> },
): Promise<Array<Id<"canvases">>> {
  const sourceIds = readStarterCanvasIds();
  const now = Date.now();
  const created: Array<Id<"canvases">> = [];

  for (const [index, sourceId] of sourceIds.entries()) {
    // `.catch` parce qu'un id malformé fait lever `db.get` (un id valide mais
    // supprimé rend simplement `null`) : ces ids sont collés à la main, une
    // coquille dans l'un ne doit pas priver le compte des autres.
    const source = await ctx.db.get("canvases", sourceId).catch(() => null);
    if (!source) continue;

    created.push(
      await cloneCanvasForUser(ctx, {
        authUserId,
        source,
        // Décroissant d'une milliseconde par rang : c'est ce qui rend l'ordre
        // de la variable d'env observable dans l'app. Estampillé plutôt que
        // laissé à l'ordre des écritures, parce que tout se passe dans une
        // seule transaction et que les `Date.now()` internes des modèles n'y
        // sont pas garantis croissants.
        updatedAt: now - index,
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
    updatedAt,
  }: {
    authUserId: Id<"users">;
    source: Doc<"canvases">;
    updatedAt: number;
  },
): Promise<Id<"canvases">> {
  const canvasId = await CanvasModels.createCanvasForUser(ctx, {
    authUserId,
    name: source.name,
    description: source.description,
  });

  const sourceNodeDatas = await ctx.db
    .query("nodeDatas")
    .withIndex("by_canvasId", (q) => q.eq("canvasId", source._id))
    .collect();

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

  const clonedNodes: CanvasNode[] = (source.nodes ?? [])
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
  const clonedEdges = (source.edges ?? []).filter(
    (edge) =>
      survivingNodeIds.has(edge.source) && survivingNodeIds.has(edge.target),
  );

  const patch: Partial<Doc<"canvases">> = {
    edges: clonedEdges,
    updatedAt,
    isSystem: true,
  };
  if (source.hotspots) patch.hotspots = source.hotspots;
  if (source.slideshows) patch.slideshows = source.slideshows;

  // Dernier write du clonage, donc c'est bien cet `updatedAt` qui reste :
  // `addCanvasNodes` en pose un à `Date.now()` au passage.
  await ctx.db.patch("canvases", canvasId, patch);

  return canvasId;
}
