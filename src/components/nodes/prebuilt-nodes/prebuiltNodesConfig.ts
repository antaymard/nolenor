import type { IconType } from "react-icons";
import type { NodeType, XyNode, XyNodeProps } from "@/types/domain";
import { nodeDataConfig } from "@/../convex/config/nodeConfig";
import type { NodeDataConfigItem } from "@/../convex/config/nodeConfig";
import { NODE_TYPE_ICON_MAP } from "./nodeIconMap";
import { OPENABLE_PREBUILT_NODE_TYPES } from "./nodeOpenability";
import BlocknoteNode from "./BlocknoteNode";
import TitleNode from "./TitleNode";
import ImageNode from "./ImageNode";
import LinkNode from "./LinkNode";
import ValueNode from "./ValueNode";
import FetchNode from "./FetchNode";
import PdfNode from "./PdfNode";
import EmbedNode from "./EmbedNode";
import TableNode from "./TableNode";
import AppNode from "./AppNode";
import AudioNode from "./AudioNode";

type NodeUiConfigItem = {
  nodeComponent: React.ComponentType<XyNodeProps>;
  nodeIcon: IconType;
  canBeOpenInWindow: boolean;
  creatable: boolean;
};

type PrebuiltNodeConfig = NodeDataConfigItem &
  NodeUiConfigItem & { node: XyNode };

const nodeUiConfig: Record<string, NodeUiConfigItem> = {
  title: {
    nodeComponent: TitleNode,
    nodeIcon: NODE_TYPE_ICON_MAP.title,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("title"),
    creatable: true,
  },
  link: {
    nodeComponent: LinkNode,
    nodeIcon: NODE_TYPE_ICON_MAP.link,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("link"),
    creatable: true,
  },
  image: {
    nodeComponent: ImageNode,
    nodeIcon: NODE_TYPE_ICON_MAP.image,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("image"),
    creatable: true,
  },
  blocknote: {
    nodeComponent: BlocknoteNode,
    nodeIcon: NODE_TYPE_ICON_MAP.blocknote,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("blocknote"),
    creatable: true,
  },
  value: {
    nodeComponent: ValueNode,
    nodeIcon: NODE_TYPE_ICON_MAP.value,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("value"),
    creatable: true,
  },
  embed: {
    nodeComponent: EmbedNode,
    nodeIcon: NODE_TYPE_ICON_MAP.embed,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("embed"),
    creatable: true,
  },
  pdf: {
    nodeComponent: PdfNode,
    nodeIcon: NODE_TYPE_ICON_MAP.pdf,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("pdf"),
    creatable: true,
  },
  // fetch is frontend-only (not yet implemented as a backend node type)
  fetch: {
    nodeComponent: FetchNode,
    nodeIcon: NODE_TYPE_ICON_MAP.fetch,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("fetch"),
    creatable: true,
  },
  table: {
    nodeComponent: TableNode,
    nodeIcon: NODE_TYPE_ICON_MAP.table,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("table"),
    creatable: true,
  },
  app: {
    nodeComponent: AppNode,
    nodeIcon: NODE_TYPE_ICON_MAP.app,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("app"),
    creatable: true,
  },
  audio: {
    nodeComponent: AudioNode,
    nodeIcon: NODE_TYPE_ICON_MAP.audio,
    canBeOpenInWindow: OPENABLE_PREBUILT_NODE_TYPES.has("audio"),
    creatable: true,
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
        // Gabarit sans `nodeDataId` : il n'existe qu'à l'insertion réelle.
        data: {
          color: config.defaultColor ?? "default",
        } as XyNode["data"],
      } as XyNode,
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

const creatableNodeTypes = new Set<NodeType>(
  prebuiltNodesConfig
    .filter((config) => config.creatable)
    .map((config) => config.type),
);

/**
 * Checks if a node type can be created via the manual creation UI
 * (Add a block menu, duplication, etc).
 */
function canNodeTypeBeCreated(
  nodeType: string | undefined,
): nodeType is NodeType {
  return nodeType ? creatableNodeTypes.has(nodeType as NodeType) : false;
}

export default prebuiltNodesConfig;
export {
  openableNodeTypes,
  canNodeTypeBeOpenedInWindow,
  creatableNodeTypes,
  canNodeTypeBeCreated,
};
export type { PrebuiltNodeConfig };
