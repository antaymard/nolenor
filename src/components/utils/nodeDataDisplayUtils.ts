import type { IconType } from "react-icons";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
export { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";

export function getNodeIcon(type: string | undefined): IconType | undefined {
  if (!type) return undefined;
  return NODE_TYPE_ICON_MAP[type];
}
