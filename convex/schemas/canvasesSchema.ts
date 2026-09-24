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

// Teinte d'identité du canvas (tuile de l'icône, pastille, fond de la
// couverture sur la home). Une clé de palette et non une couleur libre : le
// front écrit ses classes Tailwind en entier (cf. `src/lib/canvasCover.ts`),
// et une teinte hors palette n'aurait pas de classe à lui répondre. Absente =>
// teinte tirée de l'id, comme avant que le champ n'existe.
const CANVAS_COLORS = [
  "blue",
  "teal",
  "orange",
  "green",
  "pink",
  "amber",
  "sky",
  "slate",
] as const;

const canvasColorValidator = v.union(
  ...CANVAS_COLORS.map((color) => v.literal(color)),
);

// Plafond de l'icône, en unités UTF-16 : un emoji composé (drapeau, famille
// ZWJ, modificateur de teint) dépasse vite 2, mais une icône n'est pas un
// titre. Vit ici pour que le front coupe la saisie à la même borne.
const MAX_CANVAS_ICON_LENGTH = 16;

// Image de couverture sur la home, uploadée sur R2 comme les fichiers des
// nodes. La `key` est gardée pour libérer l'objet quand la couverture change
// ou que le canvas disparaît (cf. `canvasModels`), l'`url` pour l'afficher.
const canvasCoverImageValidator = v.object({
  url: v.string(),
  key: v.string(),
});

// ── Main validator ──────────────────────────────────────────────────────

// Les repères de navigation (`slideshows` et `hotspots`, deux tableaux
// portés ici, puis des nodes de type `viewport`) ont été retirés du produit —
// cf. `migrations:purgeViewportNodes`. Les nodes et edges vivent dans leurs
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

  // Identité visuelle, éditable par le propriétaire seul (comme le nom, la
  // description et le fond) : icône (un emoji) sur la home, la sidebar et le
  // coin du canvas ; couleur sur la home et la sidebar ; couverture sur la
  // home. Tous optionnels, absents => initiale du nom et teinte tirée de l'id.
  icon: v.optional(v.string()),
  color: v.optional(canvasColorValidator),
  coverImage: v.optional(canvasCoverImageValidator),

  updatedAt: v.number(),
});

type CanvasColor = (typeof CANVAS_COLORS)[number];

export {
  CANVAS_COLORS,
  MAX_CANVAS_ICON_LENGTH,
  canvasBackgroundValidator,
  canvasColorValidator,
  canvasCoverImageValidator,
  canvasesValidator,
};
export type { CanvasColor };
