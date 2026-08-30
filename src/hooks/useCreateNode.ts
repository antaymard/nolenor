import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Node } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "@/types/domain";
import { getDefaultNodeDataValues } from "@/../convex/config/nodeConfig";
import { getDefaultValuesForTemplate } from "@/../convex/config/fieldConfig";
import { generateLlmId } from "@/../convex/lib/llmId";
import { useParams } from "@tanstack/react-router";
import { useTemplatesStore } from "@/stores/templatesStore";
import { nextTopZIndex } from "@/lib/nodeLayering";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";

type CreateNodeOptions = {
  node: Node;
  position: { x: number; y: number };
  initialValues?: Record<string, unknown>;
  /**
   * Poser le curseur dans le node dès son montage. Réservé aux créations
   * manuelles (menu « Add a block », raccourcis) : un node dupliqué ou ingéré
   * depuis un fichier ne doit pas voler le focus. Seuls les types qui savent
   * s'éditer sur place le consomment — aujourd'hui `title`.
   */
  autoEdit?: boolean;
};

type CreateNodeResult = {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
};

export function useCreateNode() {
  const { addNodes, getNodes, setNodes } = useReactFlow();
  const createNodeData = useMutation(api.nodeDatas.create);
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const createNode = async ({
    node,
    position,
    initialValues = {},
    autoEdit = false,
  }: CreateNodeOptions): Promise<CreateNodeResult> => {
    const nodeId = generateLlmId();

    // Custom nodes : défauts calculés depuis le template (values keyées
    // par fieldId), templateId persisté sur le nodeData (lien autoritaire ;
    // node.data.templateId reste la copie dénormalisée côté canvas).
    const templateId =
      node.type === "custom"
        ? (node.data?.templateId as Id<"nodeTemplates"> | undefined)
        : undefined;
    const template = templateId
      ? useTemplatesStore.getState().templates.get(templateId)
      : undefined;

    const defaults = template
      ? getDefaultValuesForTemplate(template)
      : (getDefaultNodeDataValues(node.type as NodeType) ?? {});
    const values =
      Object.keys(initialValues).length > 0 ? initialValues : defaults;
    const nodeDataId = await createNodeData({
      type: node.type as NodeType,
      values,
      updatedAt: Date.now(),
      canvasId,
      ...(templateId && { templateId }),
    });

    // Déselectionner tous les nodes
    setNodes((nodes) => nodes.map((n) => ({ ...n, selected: false })));

    // Au format de React Flow, on ajoute le node avec addNodes
    addNodes({
      ...node,
      id: nodeId,
      position,
      selected: true,
      // Un node sans zIndex vaut 0, donc le fond de la pile dès qu'une commande
      // de plan a renuméroté le canvas. On le pose explicitement au-dessus pour
      // garder le "le dernier créé est au-dessus".
      zIndex: nextTopZIndex(getNodes()),
      // Add measured dimensions if width/height are known to prevent
      // React Flow from triggering a dimension change event after adding
      ...(node.width &&
        node.height && {
          measured: { width: node.width, height: node.height },
        }),
      data: {
        ...node.data,
        variant: node.data?.variant ?? "default",
        nodeDataId,
      },
    });

    // Toujours écrit, y compris à `null` : sans ça, un id non consommé (type
    // qui ne s'édite pas sur place) resterait dans le store.
    useNodeEditorStore.getState().setEditingNodeId(autoEdit ? nodeId : null);

    return { nodeId, nodeDataId };
  };

  return { createNode };
}
