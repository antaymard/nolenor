import type { ComponentType } from "react";
import type { IconType } from "react-icons";
import {
  TbAbc,
  TbCalendar,
  TbCheckbox,
  TbNumber123,
  TbSelect,
} from "react-icons/tb";
import type { FieldType } from "@/../convex/schemas/fieldTypeSchema";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type { LayoutFieldPlacement } from "@/../convex/config/templateConfig";
import ShortTextField from "@/components/fields/custom-fields/ShortTextField";
import NumberField from "@/components/fields/custom-fields/NumberField";
import DateField from "@/components/fields/custom-fields/DateField";
import SelectField from "@/components/fields/custom-fields/SelectField";
import BooleanField from "@/components/fields/custom-fields/BooleanField";

// Complément front de convex/config/fieldConfig.ts (même split que
// nodeConfig ↔ prebuiltNodesConfig) : mappe chaque type de champ vers ses
// composants de rendu. NodeDisplay = rendu compact sur le canvas,
// WindowEditor = éditeur complet en window. En V1 les deux surfaces
// partagent le même composant ; rich_text (à venir) les distinguera
// (static virtualisé sur node / éditeur Plate en window).

type FieldRenderProps = {
  field: TemplateField;
  value: unknown;
  surface: "node" | "window";
  placement: LayoutFieldPlacement;
  // undefined = lecture seule (preview du builder, permission viewer).
  // onCommit(undefined) efface la valeur (la clé est retirée des values).
  onCommit?: (value: unknown) => void;
};

type FieldRegistryEntry = {
  icon: IconType;
  label: string;
  NodeDisplay: ComponentType<FieldRenderProps>;
  WindowEditor: ComponentType<FieldRenderProps>;
};

const fieldRegistry: Record<FieldType, FieldRegistryEntry> = {
  short_text: {
    icon: TbAbc,
    label: "Text",
    NodeDisplay: ShortTextField,
    WindowEditor: ShortTextField,
  },
  number: {
    icon: TbNumber123,
    label: "Number",
    NodeDisplay: NumberField,
    WindowEditor: NumberField,
  },
  date: {
    icon: TbCalendar,
    label: "Date",
    NodeDisplay: DateField,
    WindowEditor: DateField,
  },
  select: {
    icon: TbSelect,
    label: "Select",
    NodeDisplay: SelectField,
    WindowEditor: SelectField,
  },
  boolean: {
    icon: TbCheckbox,
    label: "Checkbox",
    NodeDisplay: BooleanField,
    WindowEditor: BooleanField,
  },
};

function getFieldComponent(
  type: FieldType,
  surface: "node" | "window",
): ComponentType<FieldRenderProps> {
  const entry = fieldRegistry[type];
  return surface === "node" ? entry.NodeDisplay : entry.WindowEditor;
}

export { fieldRegistry, getFieldComponent };
export type { FieldRenderProps, FieldRegistryEntry };
