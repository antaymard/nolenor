import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeData } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import { useTemplate } from "@/stores/templatesStore";

/**
 * Titre et icône d'une fenêtre de node.
 *
 * Les custom nodes tirent leur icône de leur template, pas de leur type —
 * `templateId` est undefined pour les prébuilts, le hook renvoie alors
 * undefined et on retombe sur l'icône du type.
 */
export function useNodeWindowIdentity(nodeDataId: Id<"nodeDatas">) {
  const title = useNodeDataTitle(nodeDataId);
  const nodeData = useNodeData(nodeDataId);
  const template = useTemplate(nodeData?.templateId);

  const NodeIcon =
    nodeData?.type === "custom"
      ? getTemplateIcon(template?.icon)
      : getNodeIcon(nodeData?.type);

  return { title, nodeData, NodeIcon };
}
