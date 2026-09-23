import type { Node } from "@xyflow/react";
import { DropdownMenuCheckboxItem } from "@/components/shadcn/dropdown-menu";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import type { DisplayOptionMenuEntry } from "@/lib/nodeDisplayOptions";

/**
 * Les cases des options d'affichage, dans le sous-menu Appearance du menu
 * d'un node comme de celui d'une sélection. Les entrées viennent de
 * `getCommonDisplayOptions`, que le parent calcule aussi pour savoir s'il
 * doit afficher le sous-menu.
 *
 * Un clic écrit la même valeur sur tous les nodes, en une seule écriture :
 * un seul Ctrl+Z. Partiellement allumée, l'option s'allume partout — le
 * clic suivant, sur un état homogène, l'éteint partout.
 */
export default function DisplayOptionsMenuItems({
  nodes,
  entries,
  onApplied,
}: {
  nodes: Node[];
  entries: DisplayOptionMenuEntry[];
  onApplied?: () => void;
}) {
  const { updateCanvasNodes } = useUpdateCanvasNode();

  return entries.map(({ key, label, checked }) => (
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
        onApplied?.();
      }}
    >
      {label}
    </DropdownMenuCheckboxItem>
  ));
}
