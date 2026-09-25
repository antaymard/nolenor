import type { Node } from "@xyflow/react";
import { TbSpaces } from "react-icons/tb";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useApplyVariant } from "@/hooks/useApplyVariant";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { getAppearanceEntries } from "@/lib/nodeAppearance";

/**
 * Le sous-menu « Appearance », seul et même pour le menu d'un node et celui
 * d'une sélection : les variantes (un choix exclusif), puis les options
 * d'affichage (des cases cumulables, indépendantes de la variante).
 *
 * Rien n'est rendu quand ces nodes n'ont ni variante ni option en commun.
 */
export default function AppearanceMenu({
  nodes,
  closeMenu,
}: {
  nodes: Node[];
  closeMenu: () => void;
}) {
  const applyVariant = useApplyVariant();
  const { updateCanvasNodes } = useUpdateCanvasNode();
  const { variants, displayOptions } = getAppearanceEntries(nodes);

  if (variants.length === 0 && displayOptions.length === 0) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="whitespace-nowrap">
        <TbSpaces size={16} /> Appearance
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {variants.map((entry) => (
          <DropdownMenuItem
            className="whitespace-nowrap"
            key={entry.label}
            onClick={() => {
              void applyVariant(entry);
              closeMenu();
            }}
          >
            {entry.label}
          </DropdownMenuItem>
        ))}
        {variants.length > 0 && displayOptions.length > 0 && (
          <DropdownMenuSeparator />
        )}
        {/* Un clic écrit la même valeur sur tous les nodes, en une seule
            écriture : un seul Ctrl+Z. Partiellement allumée, l'option
            s'allume partout ; le clic suivant, sur un état homogène,
            l'éteint partout. */}
        {displayOptions.map(({ key, label, checked }) => (
          <DropdownMenuCheckboxItem
            key={key}
            className="whitespace-nowrap"
            checked={checked}
            onCheckedChange={() => {
              void updateCanvasNodes(
                nodes.map((node) => ({
                  nodeId: node.id,
                  props: { displayOptions: { [key]: !checked } },
                })),
              );
              closeMenu();
            }}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
