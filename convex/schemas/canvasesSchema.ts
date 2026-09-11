import { v } from "convex/values";

// Fond du canvas, partagé en realtime via le doc `canvases`.
// Tout est optionnel : absent => défauts côté front (gris clair + lignes).
// `variant: "none"` => pas de motif. `size` = taille dot/cross ou lineWidth.
const canvasBackgroundValidator = v.object({
  bgColor: v.optional(v.string()),
  patternColor: v.optional(v.string()),
  variant: v.optional(
    v.union(
      v.literal("lines"),
      v.literal("dots"),
      v.literal("cross"),
      v.literal("none"),
    ),
  ),
  gap: v.optional(v.number()),
  size: v.optional(v.number()),
});

// ── Main validator ──────────────────────────────────────────────────────

// Les repères de navigation (anciennement `slideshows` et `hotspots`, deux
// tableaux portés ici, nettoyés par migration en sept. 2026) sont désormais
// des nodes de type `viewport` : ils vivent dans `nodes` comme les autres,
// avec leur `nodeDatas`. Les nodes et edges eux-mêmes vivent dans leurs
// tables dédiées depuis oct. 2026 (champs embarqués prunés).
const canvasesValidator = v.object({
  creatorId: v.id("users"),
  name: v.string(),
  description: v.optional(v.string()),
  isPublic: v.optional(v.boolean()),
  // Provenance : posé sur les canvases semés à l'inscription (cf.
  // `STARTER_CANVAS_IDS`, convex/models/onboardingModels.ts), absent sur ceux
  // que l'utilisateur crée lui-même. Purement informatif — un canvas système
  // se modifie, se partage et se supprime comme n'importe quel autre.
  isSystem: v.optional(v.boolean()),

  background: v.optional(canvasBackgroundValidator),

  updatedAt: v.number(),
});

export { canvasBackgroundValidator, canvasesValidator };
