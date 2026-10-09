import { useMemo, type ComponentType } from "react";
import type { Node } from "@xyflow/react";
import {
  TbLayoutAlignBottom,
  TbLayoutAlignCenter,
  TbLayoutAlignLeft,
  TbLayoutAlignMiddle,
  TbLayoutAlignRight,
  TbLayoutAlignTop,
  TbLayoutDistributeHorizontal,
  TbLayoutDistributeVertical,
  TbLayoutGrid,
} from "react-icons/tb";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  arrangeRects,
  suggestedCommands,
  type ArrangeCommand,
} from "@/lib/arrangeNodes";
import { ARRANGE_LABELS, useArrangeNodes } from "@/hooks/useArrangeNodes";

const ICONS: Record<ArrangeCommand, ComponentType<{ size?: number }>> = {
  left: TbLayoutAlignLeft,
  hcenter: TbLayoutAlignCenter,
  right: TbLayoutAlignRight,
  top: TbLayoutAlignTop,
  vcenter: TbLayoutAlignMiddle,
  bottom: TbLayoutAlignBottom,
  // Croisés exprès : chez Tabler, « distribute-horizontal » dessine deux
  // barres horizontales (haut et bas) — une répartition verticale.
  distributeH: TbLayoutDistributeVertical,
  distributeV: TbLayoutDistributeHorizontal,
  tidy: TbLayoutGrid,
};

// L'ordre et les groupes du panneau d'alignement de Figma.
const GROUPS: ArrangeCommand[][] = [
  ["left", "hcenter", "right"],
  ["top", "vcenter", "bottom"],
  ["distributeH", "distributeV", "tidy"],
];

/**
 * Alignement et distribution d'une sélection, à la Figma.
 *
 * Les actions qui collent à la forme de la sélection — aligner le haut et
 * espacer une rangée, aligner à gauche et espacer une colonne, ranger une
 * grille — remontent au premier niveau du menu ; toutes les autres restent
 * dans le sous-menu. Une action qui ne changerait rien est grisée (ou n'est
 * pas suggérée).
 *
 * Rien n'est rendu sous deux nodes déplaçables.
 */
export default function ArrangeMenu({
  nodes,
  closeMenu,
}: {
  nodes: Node[];
  closeMenu: () => void;
}) {
  const { arrangeNodes, getArrangeableRects } = useArrangeNodes();
  // Le menu se remonte à chaque clic droit : la sélection est figée le temps
  // qu'il reste ouvert.
  const rects = useMemo(
    () => getArrangeableRects(nodes),
    [getArrangeableRects, nodes],
  );
  const suggested = useMemo(() => suggestedCommands(rects), [rects]);
  const isNoop = useMemo(
    () =>
      new Set(
        GROUPS.flat().filter(
          (command) => arrangeRects(rects, command).size === 0,
        ),
      ),
    [rects],
  );

  if (rects.length < 2) return null;

  const item = (command: ArrangeCommand) => {
    const Icon = ICONS[command];
    return (
      <DropdownMenuItem
        key={command}
        className="whitespace-nowrap"
        disabled={isNoop.has(command)}
        onClick={() => {
          arrangeNodes(nodes, command);
          closeMenu();
        }}
      >
        <Icon size={16} />
        {ARRANGE_LABELS[command]}
      </DropdownMenuItem>
    );
  };

  return (
    <>
      {suggested.map(item)}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbLayoutAlignLeft size={16} /> Align & distribute
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {GROUPS.map((group, index) => [
            index > 0 && <DropdownMenuSeparator key={`separator-${index}`} />,
            ...group.map(item),
          ])}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  );
}
