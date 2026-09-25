import { TbCopy } from "react-icons/tb";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useCopyNodeIdsItems } from "@/hooks/useCopyNodeIds";

export default function CopyNodeIdsSubMenu({
  nodeIds,
  closeMenu,
}: {
  nodeIds: string[];
  closeMenu: () => void;
}) {
  const { label, items } = useCopyNodeIdsItems(nodeIds);

  if (nodeIds.length === 0) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="whitespace-nowrap">
        <TbCopy size={16} /> {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {items.map((item) => (
          <DropdownMenuItem
            className="whitespace-nowrap"
            key={item.label}
            onClick={() => {
              void item.onClick();
              closeMenu();
            }}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
