import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import * as EdgeModels from "./models/edgeModels";
import * as NodeModels from "./models/nodeModels";

// Lecture seule, pour l'export de données depuis Settings.
//
// L'export est assemblé côté navigateur (cf. src/lib/export/) : ces queries ne
// font que servir les données par pages, le rendu Markdown et le zip vivent
// dans le client. Rien n'est stocké, planifié ni mis en cache serveur.
//
// Un `nodeDatas` porte le contenu d'un node : un `.collect()` dépasserait la
// limite de lecture d'une query dès qu'un compte grossit. D'où la pagination
// systématique, plafonnée en octets — `maximumBytesRead` renvoie une page
// partielle au lieu de faire échouer la query.
const MAX_BYTES_PER_PAGE = 4 * 1024 * 1024;

// Métadonnées seules pour que le sélecteur de canvas de l'UI reste léger.
// La structure (nodes, edges) arrive par `getCanvasForExport`, un canvas à
// la fois.
export const listCanvasesForExport = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    const result = await ctx.db
      .query("canvases")
      .withIndex("by_creator_and_updatedAt", (q) =>
        q.eq("creatorId", authUserId),
      )
      .order("desc")
      .paginate({ ...args.paginationOpts, maximumBytesRead: MAX_BYTES_PER_PAGE });

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (canvas) => ({
          _id: canvas._id,
          name: canvas.name,
          description: canvas.description,
          updatedAt: canvas.updatedAt,
          nodeCount: (await NodeModels.listFromCanvas(ctx, { canvasId: canvas._id }))
            .length,
        })),
      ),
    };
  },
});

// Le document complet : le doc canvas enrichi de sa structure — nodes et
// edges projetés depuis les tables dédiées. C'est ce qui part dans
// `canvas.json` (le format reprend la forme historique des canvases, où les
// deux arrays vivaient en embarqué).
//
// "owner" et pas "viewer" : on n'exporte que ce que l'utilisateur a créé. Un
// canvas seulement partagé avec lui appartient à quelqu'un d'autre.
export const getCanvasForExport = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const authUserId = await requireAuth(ctx);
    const { canvas } = await requireCanvasAccess(
      ctx,
      canvasId,
      authUserId,
      "owner",
    );
    const tableNodes = await NodeModels.listFromCanvas(ctx, { canvasId });
    const tableEdges = await EdgeModels.listFromCanvas(ctx, { canvasId });
    return {
      ...canvas,
      nodes: tableNodes.map(NodeModels.toCanvasNode),
      edges: tableEdges.map(EdgeModels.toCanvasEdge),
    };
  },
});

export const listNodeDatasForExport = query({
  args: {
    canvasId: v.id("canvases"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, args.canvasId, authUserId, "owner");

    const result = await ctx.db
      .query("nodeDatas")
      .withIndex("by_canvasId", (q) => q.eq("canvasId", args.canvasId))
      .paginate({ ...args.paginationOpts, maximumBytesRead: MAX_BYTES_PER_PAGE });

    // Les nodes mis à la corbeille restent en base jusqu'à la purge, mais
    // n'ont plus de place dans un export du contenu courant. Le statut se lit
    // sur la ligne `nodes` — source de vérité unique de la corbeille — et non
    // sur un miroir porté par le nodeData, qui pourrait diverger.
    //
    // Filtré après la pagination : le curseur doit rester celui de la query,
    // pas du filtre. Une lecture indexée par nodeData de la page, bornée par
    // `maximumBytesRead` ; `listRecentByCanvasId` paie déjà le même prix.
    const statuses = await Promise.all(
      result.page.map((nodeData) =>
        NodeModels.getNodeByNodeDataId(ctx, { nodeDataId: nodeData._id }),
      ),
    );

    return {
      ...result,
      page: result.page.filter(
        (_nodeData, index) => statuses[index]?.status !== "trashed",
      ),
    };
  },
});

// Table de correspondance pour les nodes `custom`, dont les `values` sont
// keyées par fieldId : sans les templates l'export produirait des sections
// nommées `f_a1b2c3` au lieu du nom des champs. Volume borné (les templates
// d'un seul user), `.collect()` est sûr ici.
export const listTemplatesForExport = query({
  args: {},
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    const templates = await ctx.db
      .query("nodeTemplates")
      .withIndex("by_creator", (q) => q.eq("creatorId", authUserId))
      .collect();

    return templates.map((template) => ({
      _id: template._id,
      name: template.name,
      titleFieldId: template.titleFieldId,
      fields: template.fields,
    }));
  },
});
