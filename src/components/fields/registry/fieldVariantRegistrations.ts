import type {
  FieldComponent,
  FieldEditorComponent,
  FieldTriggerRenderer,
  FieldViewComponent,
} from "@/components/fields/fieldHostTypes";

// Une entrée par variant déclaré dans convex/config/fieldVariants.ts (Couche
// 2) : `shell` sélectionne le shell générique qui monte ce variant.
// "custom" est l'échappatoire pour un type qui possède déjà son propre
// cycle vue/édition (aujourd'hui : select, dont le popover appartient à
// SelectCellEditor, partagé avec les tables) — l'ajouter aux 4 shells
// génériques serait un doublon, pas une généralisation.
type FieldVariantRegistration =
  | { shell: "static"; View: FieldViewComponent }
  | {
      shell: "inline";
      View: FieldViewComponent;
      Editor: FieldEditorComponent;
      mode: "toggle" | "direct";
    }
  | {
      shell: "popover";
      View: FieldViewComponent;
      Editor: FieldEditorComponent;
      renderTrigger?: FieldTriggerRenderer;
    }
  | { shell: "window"; View: FieldViewComponent }
  | { shell: "custom"; Component: FieldComponent };

export type { FieldVariantRegistration };
