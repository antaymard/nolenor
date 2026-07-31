import {
  TbLayoutColumns,
  TbLayoutRows,
  TbPlus,
  TbSeparator,
  TbTypography,
} from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import type { LayoutNode } from "@/../convex/config/templateConfig";
import {
  newContainer,
  newDivider,
  newStaticText,
  type LayoutSurface,
} from "./templateDraft";

// Ajout d'éléments de mise en page à une surface. Un seul composant pour les
// deux aperçus : la surface n'est qu'une prop, et c'est l'hôte qui sait où
// insérer (cf. resolveInsertionPoint dans TemplateEditor).
//
// Les containers ne s'obtenaient jusqu'ici qu'en enveloppant une sélection
// (« Group in »), et un container vide n'était pas créable du tout. Ces
// boutons comblent ce trou.

type LayoutAddButtonsProps = {
  surface: LayoutSurface;
  onAdd: (surface: LayoutSurface, node: LayoutNode) => void;
  disabled?: boolean;
};

const ITEMS: {
  label: string;
  title: string;
  icon: typeof TbPlus;
  make: () => LayoutNode;
}[] = [
  {
    label: "Row",
    title: "A row — lays its children side by side",
    icon: TbLayoutColumns,
    make: () => newContainer("row"),
  },
  {
    label: "Column",
    title: "A column — stacks its children",
    icon: TbLayoutRows,
    make: () => newContainer("column"),
  },
  {
    label: "Divider",
    title: "A separator line — follows the node colour on the canvas",
    icon: TbSeparator,
    make: newDivider,
  },
  {
    label: "Text",
    title: "Static text — edit its content in the panel on the right",
    icon: TbTypography,
    make: newStaticText,
  },
];

export default function LayoutAddButtons({
  surface,
  onAdd,
  disabled,
}: LayoutAddButtonsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] text-gray-400">Add</span>
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.label}
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            className="h-6 px-2 text-[11px]"
            title={item.title}
            onClick={() => onAdd(surface, item.make())}
          >
            <Icon size={11} className="mr-1" />
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
