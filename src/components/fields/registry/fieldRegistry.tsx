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
import ShortTextHeadingView from "@/components/fields/views/short_text/HeadingView";
import ShortTextEditor from "@/components/fields/editors/ShortTextEditor";
import NumberPlainView from "@/components/fields/views/number/PlainView";
import NumberKpiView from "@/components/fields/views/number/KpiView";
import NumberEditor from "@/components/fields/editors/NumberEditor";
import DateAbsoluteView from "@/components/fields/views/date/AbsoluteView";
import DateAbsoluteTrigger from "@/components/fields/views/date/AbsoluteTrigger";
import DateRelativeView from "@/components/fields/views/date/RelativeView";
import DateRelativeTrigger from "@/components/fields/views/date/RelativeTrigger";
import DateEditor from "@/components/fields/editors/DateEditor";
import BooleanCheckboxView from "@/components/fields/views/boolean/CheckboxView";
import BooleanCheckboxLabelView from "@/components/fields/views/boolean/CheckboxLabelView";
import BooleanBadgeView from "@/components/fields/views/boolean/BadgeView";
import BooleanEditor from "@/components/fields/editors/BooleanEditor";
import BooleanLabelEditor from "@/components/fields/editors/BooleanLabelEditor";
import ImageFullView from "@/components/fields/views/image/FullView";
import ImageThumbnailView from "@/components/fields/views/image/ThumbnailView";
import ImageLinkView from "@/components/fields/views/image/LinkView";
import ImageEditor from "@/components/fields/editors/ImageEditor";
import ImageThumbnailEditor from "@/components/fields/editors/ImageThumbnailEditor";
import RichTextExcerptView from "@/components/fields/views/rich_text/ExcerptView";
import RichTextFullView from "@/components/fields/views/rich_text/FullView";
import RichTextLinkView from "@/components/fields/views/rich_text/LinkView";
import RichTextEditor from "@/components/fields/editors/RichTextEditor";
import {
  SelectChipsField,
  SelectTextField,
} from "@/components/fields/self-contained/SelectField";

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
  // Même éditeur que `plain` : seul l'affichage change (c'est tout l'intérêt
  // du découpage vue/éditeur).
  heading: {
    shell: "inline",
    View: ShortTextHeadingView,
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
  kpi: {
    shell: "inline",
    View: NumberKpiView,
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
  relative: {
    shell: "popover",
    View: DateRelativeView,
    Editor: DateEditor,
    renderTrigger: DateRelativeTrigger,
  },
} satisfies Record<VariantId<"date">, FieldVariantRegistration>;

const selectVariants = {
  chips: { shell: "custom", Component: SelectChipsField },
  text: { shell: "custom", Component: SelectTextField },
} satisfies Record<VariantId<"select">, FieldVariantRegistration>;

const booleanVariants = {
  checkbox: {
    shell: "inline",
    View: BooleanCheckboxView,
    Editor: BooleanEditor,
    mode: "direct",
  },
  checkbox_label: {
    shell: "inline",
    View: BooleanCheckboxLabelView,
    Editor: BooleanLabelEditor,
    mode: "direct",
  },
  badge: { shell: "static", View: BooleanBadgeView },
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
  // Node : un clic ouvre la window (édition par escalade).
  link: { shell: "window", View: RichTextLinkView },
} satisfies Record<VariantId<"rich_text">, FieldVariantRegistration>;

const imageVariants = {
  full: {
    shell: "inline",
    View: ImageFullView,
    Editor: ImageEditor,
    mode: "direct",
  },
  thumbnail: {
    shell: "inline",
    View: ImageThumbnailView,
    Editor: ImageThumbnailEditor,
    mode: "direct",
  },
  link: { shell: "static", View: ImageLinkView },
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
