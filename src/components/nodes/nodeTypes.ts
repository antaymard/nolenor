import type { ComponentType } from "react";
import type { XyNodeProps } from "@/types/domain";
import prebuiltNodesConfig from "./prebuilt-nodes/prebuiltNodesConfig";
import CustomNode from "./custom/CustomNode";

/**
 * Les composants de node, par type.
 *
 * Typés `ComponentType<XyNodeProps>` et non `any` : depuis que les composants
 * annoncent ce que React Flow leur passe réellement, il n'y a plus rien à
 * contourner ici.
 */
const nodeTypes: Record<string, ComponentType<XyNodeProps>> = {
  ...prebuiltNodesConfig.reduce<Record<string, ComponentType<XyNodeProps>>>(
    (acc, node) => {
      acc[node.type] = node.nodeComponent;
      return acc;
    },
    {},
  ),
  // Volontairement hors de prebuiltNodesConfig : les menus itèrent la
  // config prébuilt, les custom nodes s'insèrent via leurs templates.
  custom: CustomNode,
};

const nodeList = [...prebuiltNodesConfig];

export { nodeTypes, nodeList };
