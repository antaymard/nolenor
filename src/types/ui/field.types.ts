// Props communes à tous les field components
export interface BaseFieldProps<T = unknown> {
  field?: import("../domain/nodeTypes").NodeField;
  value?: T;
  visualType?: "node" | "window";
  onChange?: (value: T) => void; // undefined = preview (pas de sauvegarde)
  visualSettings?: Record<string, unknown>;
  componentProps?: Record<string, unknown>; // Props supplémentaires passées au composant
}

export type FieldType =
  | "short_text"
  | "url"
  | "select"
  | "image"
  | "image_url"
  | "number"
  | "date"
  | "rich_text"
  | "boolean"
  | "file"
  | "document";
