import prebuiltNodesConfig from "./prebuilt-nodes/prebuiltNodesConfig";
import CustomNode from "./custom/CustomNode";

const nodeTypes = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...prebuiltNodesConfig.reduce<Record<string, React.ComponentType<any>>>(
    (acc, node) => {
      acc[node.type] = node.nodeComponent;
      return acc;
    },
    {},
  ),
  // Volontairement hors de prebuiltNodesConfig : les menus itèrent la
  // config prébuilt, les custom nodes s'insèrent via leurs templates.
  // Même contorsion de typage que le reduce ci-dessus : les composants
  // node prennent un Node complet, pas les NodeProps de xyflow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custom: CustomNode as React.ComponentType<any>,
};

const nodeList = [...prebuiltNodesConfig];

export { nodeTypes, nodeList };
