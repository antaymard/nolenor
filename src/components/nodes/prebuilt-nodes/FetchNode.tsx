import NodeFrame from "@/components/nodes/NodeFrame";
import { useNodeDataValues } from "@/hooks/useNodeData";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { TbPencil } from "react-icons/tb";
import { memo, useState } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import type { XyNodeProps } from "@/types/domain";

function FetchNode(xyNode: XyNodeProps) {
  const nodeData = useNodeDataValues(
    xyNode.data.nodeDataId,
  );

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <NodeToolbarButton label="Edit" title="Edit link">
              <TbPencil />
            </NodeToolbarButton>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">omg</div>
          </PopoverContent>
        </Popover>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        <pre>{JSON.stringify(nodeData, null, 2)}</pre>
      </NodeFrame>
    </>
  );
}

export default memo(FetchNode, areNodePropsEqual);
