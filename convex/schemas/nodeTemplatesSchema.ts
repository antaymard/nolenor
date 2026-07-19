import { v } from "convex/values";
import { fieldTypeValidator } from "./fieldTypeSchema";

// ── Template field ──────────────────────────────────────────────────────
// Les values des instances (nodeDatas.values) sont keyées par `id` — jamais
// par `name` — pour que renommer un champ soit gratuit. Un id n'est JAMAIS
// réutilisé ni modifié après création.
const templateFieldValidator = v.object({
  id: v.string(),
  name: v.string(),
  type: fieldTypeValidator,
  required: v.optional(v.boolean()),
  // Description à destination du LLM (injectée dans les .describe() des
  // schémas générés).
  description: v.optional(v.string()),
  // Options par type, validées côté app par fieldConfig :
  //   select: { choices: [{ id, label, color? }], isMulti? }
  //   number: { unit?, min?, max? } · short_text: { placeholder? }
  //   date:   { includeTime? }
  options: v.optional(v.record(v.string(), v.any())),
  default: v.optional(v.any()),
});

// ── Main validator ──────────────────────────────────────────────────────
const nodeTemplatesValidator = v.object({
  creatorId: v.id("users"),
  name: v.string(),
  description: v.optional(v.string()),
  // Entrée du catalogue agent ; auto-générée depuis fields si absente.
  llmDescription: v.optional(v.string()),
  // Nom d'icône d'un set curaté côté front (pas de composant en DB).
  icon: v.optional(v.string()),
  // Couleur par défaut des nodes créés depuis ce template (colorsEnum).
  color: v.optional(v.string()),
  fields: v.array(templateFieldValidator),
  // Arbres de layout récursifs (containers flex + placements de champs).
  // Convex ne supporte pas les validateurs récursifs : la forme est imposée
  // par templateConfig (Zod) dans les mutations — même pattern que
  // nodeDatas.values. Un champ présent dans un seul arbre n'est visible que
  // sur cette surface ; absent des deux = data-only.
  nodeLayout: v.any(),
  // Absent ⇒ le template n'est pas ouvrable en window (gate du double-clic).
  windowLayout: v.optional(v.any()),
  // Champ (short_text) qui fournit le titre du node : recherche, header de
  // window, écritures de titre par l'agent.
  titleFieldId: v.optional(v.string()),
  defaultDimensions: v.object({
    width: v.number(),
    height: v.number(),
    resizable: v.optional(v.boolean()),
  }),
  windowSize: v.optional(
    v.object({ width: v.number(), height: v.number() }),
  ),
  // Soft-delete uniquement : les instances vivantes doivent continuer à
  // rendre, un template archivé reste résolvable par listForCanvas.
  archivedAt: v.optional(v.number()),
  updatedAt: v.number(),
});

export { nodeTemplatesValidator, templateFieldValidator };
