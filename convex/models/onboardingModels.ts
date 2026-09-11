import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import * as CanvasModels from "./canvasModels";
import * as EdgeModels from "./edgeModels";
import * as NodeModels from "./nodeModels";

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
  const nodeDataById = new Map(
    sourceNodeDatas.map((nodeData) => [nodeData._id, nodeData] as const),
  );

  // Nodes recréés un à un via la voie de création canonique (nodeData
  // inclus, chunks rebuild planifiés, variant par défaut appliqué) avec des
  // llmIds FRAIS — un clone ne partage aucune référence avec sa source.
  // `listFromCanvas` est ordonné chronologiquement : les parents précèdent
  // leurs enfants, donc le remap `parentId` (vieux llmId → neuf) trouve
  // toujours le parent déjà cloné.
  //
  // Les nodes "custom" pointent un nodeTemplates scopé au compte source ; le
  // partage cross-utilisateur de ce lien après clonage n'est pas garanti côté
  // fenêtre (résolution du template, droits d'édition). Hors scope : on les
  // saute plutôt que de cloner un node cassé — et `createNodeData` lèverait
  // de toute façon sur un custom sans templateId.
  const oldToNewNodeIds = new Map<string, string>();
  const sourceNodes = await NodeModels.listFromCanvas(ctx, {
    canvasId: source._id,
  });

  for (const node of sourceNodes) {
    const nodeData = nodeDataById.get(node.nodeDataId);
    if (!nodeData || nodeData.type === "custom") continue;

    // `toCanvasNode` donne la projection DTO : on retire l'identité (id,
    // nodeDataId) et on remappe `parentId` vers le nouveau llmId.
    const {
      id: _oldNodeId,
      nodeDataId: _oldNodeDataId,
      parentId: oldParentId,
      ...nodeFields
    } = NodeModels.toCanvasNode(node);
    const parentId =
      oldParentId !== undefined
        ? oldToNewNodeIds.get(oldParentId)
        : undefined;

    const { nodeId } = await NodeModels.createNodeWithData(ctx, {
      node: {
        canvasId,
        ...nodeFields,
        ...(parentId !== undefined && { parentId }),
      },
      values: nodeData.values,
      touchCanvas: false,
    });
    oldToNewNodeIds.set(node.id, nodeId);
  }

  // Les edges référencent les llmIds de la source : endpoints remappés vers
  // les nouveaux, handles/markerEnd/data conservés. Seuls ceux pointant un
  // node sauté ci-dessus sont filtrés.
  const sourceEdges = await EdgeModels.listFromCanvas(ctx, {
    canvasId: source._id,
  });
  const clonedEdges = sourceEdges.flatMap((edge) => {
    const newSource = oldToNewNodeIds.get(edge.source);
    const newTarget = oldToNewNodeIds.get(edge.target);
    if (!newSource || !newTarget) return [];
    return [
      {
        canvasId,
        source: newSource,
        target: newTarget,
        ...(edge.sourceHandle !== undefined && {
          sourceHandle: edge.sourceHandle,
        }),
        ...(edge.targetHandle !== undefined && {
          targetHandle: edge.targetHandle,
        }),
        markerEnd: edge.markerEnd,
        ...(edge.data !== undefined && { data: edge.data }),
      },
    ];
  });

  if (clonedEdges.length > 0) {
    await EdgeModels.createEdges(ctx, {
      edges: clonedEdges,
      touchCanvas: false,
    });
  }

  // Dernier write du clonage, donc c'est bien cet `updatedAt` qui reste —
  // nodes et edges sont créés sans `touchCanvas`.
  await ctx.db.patch("canvases", canvasId, { updatedAt, isSystem: true });

  return canvasId;
}
