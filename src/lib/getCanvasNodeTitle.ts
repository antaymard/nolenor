import type { CanvasNode } from "@/types";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { useTemplatesStore } from "@/stores/templatesStore";

type NodeDatasMap = Map<Id<"nodeDatas">, Doc<"nodeDatas">>;

export function getCanvasNodeTitle(
  node: CanvasNode,
  nodeDatas: NodeDatasMap,
): string {
  const nodeConfig = prebuiltNodesConfig.find(
    (config) => config.type === node.type,
  );
  const nodeDataId =
    node.nodeDataId ?? (node.data?.nodeDataId as Id<"nodeDatas"> | undefined);
  const nodeData = nodeDataId ? nodeDatas.get(nodeDataId) : undefined;

  // Custom : le titre exact vient du template (titleFieldId, fallback nom
  // du template) — lecture par getState, ce helper n'est pas un hook.
  const template = nodeData?.templateId
    ? useTemplatesStore.getState().templates.get(nodeData.templateId)
    : undefined;

  return nodeData
    ? getNodeDataTitle(nodeData, template ?? null)
    : nodeConfig?.label || node.type;
}
