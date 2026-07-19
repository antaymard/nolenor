import { v, type Infer } from "convex/values";

// Types de champs disponibles pour les custom node templates (V1).
// rich_text (Plate) et image (R2) arriveront dans une phase dédiée ;
// ajouter un literal ici est un push de schéma trivial.
const fieldTypeValues = [
  "short_text",
  "number",
  "date",
  "select",
  "boolean",
] as const;

const fieldTypeValidator = v.union(
  ...fieldTypeValues.map((type) => v.literal(type)),
);

type FieldType = Infer<typeof fieldTypeValidator>;

export { fieldTypeValues, fieldTypeValidator };
export type { FieldType };
