import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireAuth, requireCanvasAccess } from "./lib/auth";

// Lecture seule, pour l'export de données depuis Settings.
//
// L'export est assemblé côté navigateur (cf. src/lib/export/) : ces queries ne
// font que servir les données par pages, le rendu Markdown et le zip vivent
// dans le client. Rien n'est stocké, planifié ni mis en cache serveur.
//
// Un doc `canvases` peut peser jusqu'à 1 Mo (nodes/edges inline) et un
// `nodeDatas` porte le contenu d'un node : un `.collect()` sur l'un ou l'autre
// dépasserait la limite de lecture d'une query dès qu'un compte grossit. D'où
// la pagination systématique, plafonnée en octets — `maximumBytesRead` renvoie
// une page partielle au lieu de faire échouer la query.
const MAX_BYTES_PER_PAGE = 4 * 1024 * 1024;

// Métadonnées seules : `nodes`/`edges` sont volontairement omis du retour pour
// que le sélecteur de canvas de l'UI reste léger. Ils arrivent par
// `getCanvasForExport`, un canvas à la fois.
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
      page: result.page.map((canvas) => ({
        _id: canvas._id,
        name: canvas.name,
        description: canvas.description,
        updatedAt: canvas.updatedAt,
        nodeCount: canvas.nodes?.length ?? 0,
      })),
    };
  },
});

// Le document complet : positions, edges, slideshows, hotspots. C'est ce qui
// part dans `canvas.json`.
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
    return canvas;
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

    // Les nodes retirés du canvas restent en base (corbeille de fait) mais
    // n'ont plus de place dans un export du contenu courant. Filtré après la
    // pagination : le curseur doit rester celui de la query, pas du filtre.
    return {
      ...result,
      page: result.page.filter(
        (nodeData) => nodeData.removedFromCanvasAt === undefined,
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
