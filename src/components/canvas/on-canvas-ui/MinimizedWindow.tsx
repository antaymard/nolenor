import { nodeList } from "@/components/nodes/nodeTypes";
import { useNodesData } from "@xyflow/react";
import nodeColors from "../../nodes/nodeColors";
import type { colorsEnum, NodeConfig } from "@/types/domain";
import { useWindowsStore } from "@/stores/windowsStore";
import type { OpenedWindow } from "@/stores/windowsStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { Button } from "@/components/shadcn/button";
import { HiMiniXMark } from "react-icons/hi2";
import { TbTemplate } from "react-icons/tb";

export default function MinimizedWindow({ window }: { window: OpenedWindow }) {
  const closeWindow = useWindowsStore((state) => state.closeWindow);
  const toggleMinimizeWindow = useWindowsStore(
    (state) => state.toggleMinimizeWindow,
  );

  const nodeData = useNodesData(window.xyNodeId);
  const { data } = nodeData || {};
  const nodeType =
    typeof nodeData?.type === "string" ? nodeData.type : undefined;
  const nodeConfig = nodeList.find((node) => node.type === nodeType) as
    | NodeConfig
    | undefined;
  const nodeColorClassNames =
    nodeColors[(data?.color as colorsEnum) || "default"];

  const Icon = nodeConfig?.nodeIcon || TbTemplate;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div className="relative group">
          <Button
            type="button"
            onClick={() =>
              toggleMinimizeWindow(
                window.xyNodeId,
                window.windowState !== "minimized",
              )
            }
            className={window.windowState === "minimized" ? "" : "bg-accent"}
            variant="ghost"
          >
            {Icon && <Icon size={20} />}
          </Button>
          <button
            className="hidden group-hover:flex h-4 w-4 rounded-full p-0 m-0 aspect-square items-center justify-center absolute bg-destructive/10 text-destructive hover:bg-destructive hover:text-white -top-1 -right-1"
            onClick={() => closeWindow(window.xyNodeId)}
          >
            <HiMiniXMark size={12} />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent align="start">
        <span className={nodeColorClassNames.nodeText}>{data?.name}</span>
      </TooltipContent>
    </Tooltip>
  );
}
