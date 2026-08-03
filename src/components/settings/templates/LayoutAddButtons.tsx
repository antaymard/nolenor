import {
  TbLayoutColumns,
  TbLayoutRows,
  TbPlus,
  TbSeparator,
  TbTypography,
} from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import type {
  LayoutContainer,
  LayoutNode,
} from "@/../convex/config/templateConfig";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import {
  findLayoutNode,
  layoutNodeLabel,
  newContainer,
  newDivider,
  newStaticText,
  resolveInsertionPoint,
  type LayoutSurface,
} from "./templateDraft";

// Ajout d'éléments de mise en page à une surface. Un seul composant pour les
// deux aperçus : la surface n'est qu'une prop, et c'est l'hôte qui sait où
// insérer (cf. resolveInsertionPoint dans TemplateEditor).
//
// Un menu et non quatre boutons en ligne : la barre prenait toute la largeur
// au-dessus de chaque aperçu, pour une action occasionnelle. Le déclencheur se
// réduit à un « + » posé contre l'aperçu qu'il sert.
//
// Le menu affiche AUSSI la destination. L'insertion suit la sélection courante
// — même règle pour les quatre kinds — et comme un ajout sélectionne le nœud
// créé, les ajouts successifs s'enchaînent dans le même container. Rien ne le
// laissait deviner avant le clic ; l'en-tête le dit, et une entrée dédiée
// permet de viser la racine sans passer par l'arbre.

type LayoutAddButtonsProps = {
  surface: LayoutSurface;
  // L'arbre de CETTE surface, et la sélection si elle la concerne : le menu
  // doit nommer la destination avant le clic, il lui faut donc de quoi la
  // résoudre lui-même.
  tree: LayoutContainer;
  fields: TemplateField[];
  selectedId: string | null;
  // `atRoot` force l'insertion en fin de racine, en ignorant la sélection.
  onAdd: (surface: LayoutSurface, node: LayoutNode, atRoot?: boolean) => void;
  disabled?: boolean;
};

const ITEMS: {
  label: string;
  hint: string;
  icon: typeof TbPlus;
  make: () => LayoutNode;
}[] = [
  {
    label: "Row",
    hint: "Lays its children side by side",
    icon: TbLayoutColumns,
    make: () => newContainer("row"),
  },
  {
    label: "Column",
    hint: "Stacks its children",
    icon: TbLayoutRows,
    make: () => newContainer("column"),
  },
  {
    label: "Divider",
    hint: "Separator line — follows the node colour, and turns vertical inside a row",
    icon: TbSeparator,
    make: newDivider,
  },
  {
    label: "Text",
    hint: "Static text — edit its content in the panel on the right",
    icon: TbTypography,
    make: newStaticText,
  },
];

export default function LayoutAddButtons({
  surface,
  tree,
  fields,
  selectedId,
  onAdd,
  disabled,
}: LayoutAddButtonsProps) {
  // Exactement la résolution qu'appliquera l'hôte : un second calcul
  // divergerait tôt ou tard et le menu annoncerait une destination fausse.
  const { containerId } = resolveInsertionPoint(tree, selectedId);
  const destination = findLayoutNode(tree, containerId);
  const isRoot = containerId === tree.id;
  const destinationLabel = destination
    ? `${layoutNodeLabel(destination, fields)}${isRoot ? " (root)" : ""}`
    : "root";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={disabled}
          className="h-6 w-6 bg-white/80"
          title="Add a layout element"
        >
          <TbPlus size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-[11px] font-normal text-gray-400">
          Add to <span className="font-medium text-gray-600">{destinationLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem
              key={item.label}
              className="items-start gap-2"
              onSelect={() => onAdd(surface, item.make())}
            >
              <Icon size={13} className="mt-0.5 shrink-0 text-gray-500" />
              <span className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">{item.label}</span>
                <span className="text-[11px] leading-tight text-gray-400">
                  {item.hint}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
        {/* Les MÊMES quatre kinds, mais à la racine. En sous-menu plutôt qu'en
            second bloc : la liste doublée alourdirait le menu pour une sortie
            de secours. Masqué quand la destination EST déjà la racine —
            proposer d'y aller alors qu'on y est n'ajouterait qu'un doute. */}
        {!isRoot && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">
                Add at root instead
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                {ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.label}
                      className="gap-2 text-xs"
                      onSelect={() => onAdd(surface, item.make(), true)}
                    >
                      <Icon size={13} className="shrink-0 text-gray-500" />
                      {item.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
