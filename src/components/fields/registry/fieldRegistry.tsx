import type { IconType } from "react-icons";
import {
  TbAbc,
  TbCalendar,
  TbCheckbox,
  TbNews,
  TbNumber123,
  TbPhoto,
  TbSelect,
} from "react-icons/tb";
import type { FieldType } from "@/../convex/schemas/fieldTypeSchema";
import type { VariantId } from "@/../convex/config/fieldVariants";
import type { FieldVariantRegistration } from "@/components/fields/registry/fieldVariantRegistrations";

import ShortTextPlainView from "@/components/fields/views/short_text/PlainView";
import ShortTextEditor from "@/components/fields/editors/ShortTextEditor";
import NumberPlainView from "@/components/fields/views/number/PlainView";
import NumberEditor from "@/components/fields/editors/NumberEditor";
import DateAbsoluteView from "@/components/fields/views/date/AbsoluteView";
import DateAbsoluteTrigger from "@/components/fields/views/date/AbsoluteTrigger";
import DateEditor from "@/components/fields/editors/DateEditor";
import BooleanCheckboxView from "@/components/fields/views/boolean/CheckboxView";
import BooleanEditor from "@/components/fields/editors/BooleanEditor";
import ImageFullView from "@/components/fields/views/image/FullView";
import ImageEditor from "@/components/fields/editors/ImageEditor";
import RichTextExcerptView from "@/components/fields/views/rich_text/ExcerptView";
import RichTextFullView from "@/components/fields/views/rich_text/FullView";
import RichTextEditor from "@/components/fields/editors/RichTextEditor";
import SelectChipsField from "@/components/fields/self-contained/SelectChipsField";

// Complément front de convex/config/fieldConfig.ts + fieldVariants.ts (même
// split que nodeConfig ↔ prebuiltNodesConfig) : mappe chaque (type, variant)
// vers son shell + ses composants de rendu. Chaque `variants` est déclaré
// avec `satisfies Record<VariantId<T>, ...>` : un variant ajouté/renommé
// côté fieldVariants.ts sans entrée correspondante ici est une erreur de
// COMPILATION, jamais un trou découvert au rendu.

type FieldTypeRegistryEntry = {
  icon: IconType;
  label: string;
  variants: Record<string, FieldVariantRegistration>;
};

const shortTextVariants = {
  plain: {
    shell: "inline",
    View: ShortTextPlainView,
    Editor: ShortTextEditor,
    mode: "toggle",
  },
} satisfies Record<VariantId<"short_text">, FieldVariantRegistration>;

const numberVariants = {
  plain: {
    shell: "inline",
    View: NumberPlainView,
    Editor: NumberEditor,
    mode: "toggle",
  },
} satisfies Record<VariantId<"number">, FieldVariantRegistration>;

const dateVariants = {
  absolute: {
    shell: "popover",
    View: DateAbsoluteView,
    Editor: DateEditor,
    renderTrigger: DateAbsoluteTrigger,
  },
} satisfies Record<VariantId<"date">, FieldVariantRegistration>;

const selectVariants = {
  chips: { shell: "custom", Component: SelectChipsField },
} satisfies Record<VariantId<"select">, FieldVariantRegistration>;

const booleanVariants = {
  checkbox: {
    shell: "inline",
    View: BooleanCheckboxView,
    Editor: BooleanEditor,
    mode: "direct",
  },
} satisfies Record<VariantId<"boolean">, FieldVariantRegistration>;

const richTextVariants = {
  // Node : jamais d'éditeur monté sur le canvas (cf. plan).
  excerpt: { shell: "static", View: RichTextExcerptView },
  // Window : commit "deferred", cf. RichTextEditor pour le canal différé.
  full: {
    shell: "inline",
    View: RichTextFullView,
    Editor: RichTextEditor,
    mode: "direct",
  },
} satisfies Record<VariantId<"rich_text">, FieldVariantRegistration>;

const imageVariants = {
  full: {
    shell: "inline",
    View: ImageFullView,
    Editor: ImageEditor,
    mode: "direct",
  },
} satisfies Record<VariantId<"image">, FieldVariantRegistration>;

const fieldRegistry: Record<FieldType, FieldTypeRegistryEntry> = {
  short_text: { icon: TbAbc, label: "Text", variants: shortTextVariants },
  number: { icon: TbNumber123, label: "Number", variants: numberVariants },
  date: { icon: TbCalendar, label: "Date", variants: dateVariants },
  select: { icon: TbSelect, label: "Select", variants: selectVariants },
  boolean: { icon: TbCheckbox, label: "Checkbox", variants: booleanVariants },
  rich_text: { icon: TbNews, label: "Rich text", variants: richTextVariants },
  image: { icon: TbPhoto, label: "Image", variants: imageVariants },
};

export { fieldRegistry };
export type { FieldTypeRegistryEntry };
