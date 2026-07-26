import type { ComponentType, ReactNode } from "react";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type { FieldSurface } from "@/../convex/config/fieldVariants";

// Contrats partagés par FieldHost, les 4 shells, les editors/ et les
// views/<type>/ (Couche 4 du design "variants de champs"). Une Vue est pure
// (aucun hook, aucun commit) : elle peut être réutilisée n'importe où un
// rendu lecture-seule de la valeur est nécessaire (preview builder, futur
// affichage agent). Un Editor reçoit `commit`/`cancel` du shell qui le
// monte — jamais directement `onCommit` de FieldHost.

type FieldViewProps = {
  field: TemplateField;
  value: unknown;
  surface: FieldSurface;
  options?: Record<string, unknown>;
};

type FieldEditorProps = FieldViewProps & {
  commit: (value: unknown) => void;
  cancel: () => void;
};

// Contrat des composants "self-contained" (registration `shell: "custom"`) :
// même forme que l'ancien FieldRenderProps — un seul composant gère lui-même
// tout son cycle vue/édition (ex. select, qui délègue à SelectCellEditor,
// déjà partagé avec les tables et déjà propriétaire de son propre popover —
// le forcer dans PopoverShell doublerait les popovers).
type FieldComponentProps = FieldViewProps & {
  onCommit?: (value: unknown) => void;
  onEscalate?: () => void;
};

type FieldViewComponent = ComponentType<FieldViewProps>;
type FieldEditorComponent = ComponentType<FieldEditorProps>;
type FieldComponent = ComponentType<FieldComponentProps>;

// Utilisé uniquement par PopoverShell pour les variants dont le "fermé"
// porte une action de mutation légère (ex. date : bouton clear à côté du
// texte) — le seul cas où le contenu affiché quand le popover est fermé
// n'est pas une Vue pure. Optionnel : la plupart des variants popover s'en
// passent (le trigger par défaut est alors `<View />`).
type FieldTriggerRenderer = (
  props: FieldViewProps & { onCommit: (value: unknown) => void },
) => ReactNode;

export type {
  FieldViewProps,
  FieldEditorProps,
  FieldComponentProps,
  FieldViewComponent,
  FieldEditorComponent,
  FieldComponent,
  FieldTriggerRenderer,
};
