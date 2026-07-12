import type { IconType } from "react-icons";
import type { XyNodeData } from "@/types/domain";
import type { NodeType } from "@/types/domain";
import type { Node } from "@xyflow/react";
import { nodeDataConfig } from "@/../convex/config/nodeConfig";
import type { NodeDataConfigItem } from "@/../convex/config/nodeConfig";
import { NODE_TYPE_ICON_MAP } from "./nodeIconMap";
import DocumentNode from "./DocumentNode";
import TitleNode from "./TitleNode";
import ImageNode from "./ImageNode";
import LinkNode from "./LinkNode";
import ValueNode from "./ValueNode";
import FetchNode from "./FetchNode";
import PdfNode from "./PdfNode";
import EmbedNode from "./EmbedNode";
import TableNode from "./TableNode";
import AppNode from "./AppNode";

type NodeUiConfigItem = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeComponent: React.ComponentType<any>;
  nodeIcon: IconType;
  canBeOpenInWindow: boolean;
};

type PrebuiltNodeConfig = NodeDataConfigItem &
  NodeUiConfigItem & { node: Node };

const nodeUiConfig: Record<string, NodeUiConfigItem> = {
  title: {
    nodeComponent: TitleNode,
    nodeIcon: NODE_TYPE_ICON_MAP.title,
    canBeOpenInWindow: false,
  },
  link: {
    nodeComponent: LinkNode,
    nodeIcon: NODE_TYPE_ICON_MAP.link,
    canBeOpenInWindow: false,
  },
  image: {
    nodeComponent: ImageNode,
    nodeIcon: NODE_TYPE_ICON_MAP.image,
    canBeOpenInWindow: true,
  },
  document: {
    nodeComponent: DocumentNode,
    nodeIcon: NODE_TYPE_ICON_MAP.document,
    canBeOpenInWindow: true,
  },
  value: {
    nodeComponent: ValueNode,
    nodeIcon: NODE_TYPE_ICON_MAP.value,
    canBeOpenInWindow: false,
  },
  embed: {
    nodeComponent: EmbedNode,
    nodeIcon: NODE_TYPE_ICON_MAP.embed,
    canBeOpenInWindow: true,
  },
  pdf: {
    nodeComponent: PdfNode,
    nodeIcon: NODE_TYPE_ICON_MAP.pdf,
    canBeOpenInWindow: true,
  },
  // fetch is frontend-only (not yet implemented as a backend node type)
  fetch: {
    nodeComponent: FetchNode,
    nodeIcon: NODE_TYPE_ICON_MAP.fetch,
    canBeOpenInWindow: false,
  },
  table: {
    nodeComponent: TableNode,
    nodeIcon: NODE_TYPE_ICON_MAP.table,
    canBeOpenInWindow: true,
  },
  app: {
    nodeComponent: AppNode,
    nodeIcon: NODE_TYPE_ICON_MAP.app,
    canBeOpenInWindow: true,
  },
};

// Build the prebuilt node config by merging nodeDataConfig with nodeUiConfig.
// nodeDataConfig is the source of truth for label, dimensions, variants,
// and data schemas. nodeUiConfig adds the React component
// and icon for each type.
const prebuiltNodesConfig: Array<PrebuiltNodeConfig> = nodeDataConfig
  .filter((config) => config.type in nodeUiConfig)
  .map((config) => {
    const ui = nodeUiConfig[config.type];
    return {
      ...config,
      ...ui,
      node: {
        id: "",
        type: config.type,
        height: config.defaultDimensions.height,
        width: config.defaultDimensions.width,
        position: { x: 0, y: 0 },
        data: {
          color: config.defaultColor ?? "default",
        } as unknown as Omit<XyNodeData, "nodeDataId">,
      } as Node,
    };
  });

const openableNodeTypes = new Set<NodeType>(
  prebuiltNodesConfig
    .filter((config) => config.canBeOpenInWindow)
    .map((config) => config.type),
);

/**
 * Checks if a node type can be opened in a window
 */
function canNodeTypeBeOpenedInWindow(
  nodeType: string | undefined,
): nodeType is NodeType {
  return nodeType ? openableNodeTypes.has(nodeType as NodeType) : false;
}

export default prebuiltNodesConfig;
export { openableNodeTypes, canNodeTypeBeOpenedInWindow };
export type { PrebuiltNodeConfig };
