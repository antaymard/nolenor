import { v, type Infer } from "convex/values";

// Types de champs disponibles pour les custom node templates.
// Ajouter un literal ici est un push de schéma trivial (V2+ : url, file,
// node_ref…).
const fieldTypeValues = [
  "short_text",
  "number",
  "date",
  "select",
  "boolean",
  "rich_text",
  "image",
] as const;

const fieldTypeValidator = v.union(
  ...fieldTypeValues.map((type) => v.literal(type)),
);

type FieldType = Infer<typeof fieldTypeValidator>;

export { fieldTypeValues, fieldTypeValidator };
export type { FieldType };
