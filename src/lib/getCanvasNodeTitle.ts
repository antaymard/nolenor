import type { CanvasNode } from "@/types";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { getNodeDataId } from "@/lib/nodeIdentity";

type NodeDatasMap = Map<Id<"nodeDatas">, Doc<"nodeDatas">>;
type TemplatesMap = Map<Id<"nodeTemplates">, Doc<"nodeTemplates">>;

// `templates` est passée en paramètre plutôt que lue par
// useTemplatesStore.getState() : ce helper n'est pas un hook, et une lecture
// cachée du store rendait le titre insensible aux éditions de template chez
// les appelants qui rendent (les chips d'attachement). Explicite, chaque
// call-site choisit — souscription quand il rend, getState() quand il s'agit
// d'une lecture ponctuelle dans un callback.
export function getCanvasNodeTitle(
  node: CanvasNode,
  nodeDatas: NodeDatasMap,
  templates: TemplatesMap,
): string {
  const nodeConfig = prebuiltNodesConfig.find(
    (config) => config.type === node.type,
  );
  const nodeDataId = getNodeDataId(node);
  const nodeData = nodeDataId ? nodeDatas.get(nodeDataId) : undefined;

  // Custom : le titre exact vient du template (titleFieldId, fallback nom
  // du template).
  const template = nodeData?.templateId
    ? templates.get(nodeData.templateId)
    : undefined;

  return nodeData
    ? getNodeDataTitle(nodeData, template ?? null)
    : nodeConfig?.label || node.type;
}
