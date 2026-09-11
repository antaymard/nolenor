import type { FieldType } from "../ui/field.types";
export type { NodeType } from "@/../convex/schemas/nodeTypeSchema";

/**
 * Node field definition
 */
export interface NodeField {
  id: string;
  name: string;
  type: FieldType;
  description?: string;
  options?: Record<string, unknown>; // currency, placeholder, select options, etc.
}
