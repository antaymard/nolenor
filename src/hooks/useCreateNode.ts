import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Node } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { colorsEnum, NodeType } from "@/types/domain";
import { getDefaultNodeDataValues } from "@/../convex/config/nodeConfig";
import { getDefaultValuesForTemplate } from "@/../convex/config/fieldConfig";
import { useParams } from "@tanstack/react-router";
import { useTemplatesStore } from "@/stores/templatesStore";
import { nextTopZIndex } from "@/lib/nodeLayering";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import { markNodesAsPendingCreation } from "@/lib/pendingCreatedNodes";
import { toastError } from "@/components/utils/errorUtils";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { useCaptureFraming } from "./useViewportFraming";

type CreateNodeOptions = {
  node: Node;
  position: { x: number; y: number };
  initialValues?: Record<string, unknown>;
  /**
   * Poser le curseur dans le node dès son montage. Réservé aux créations
   * manuelles (menu « Add a block », raccourcis) : un node dupliqué ou ingéré
   * depuis un fichier ne doit pas voler le focus. Seuls les types qui savent
   * s'éditer sur place le consomment — aujourd'hui `title` et `viewport`.
   */
  autoEdit?: boolean;
  /**
   * Sélectionner le nouveau node (désélectionne les autres). À `false`, la
   * sélection actuelle est préservée — utile quand la création part d'une
   * UI ancrée au node source (ex. extraction d'image depuis sa modale :
   * désélectionner la source démonterait sa toolbar et fermerait le Dialog).
   */
  selectNewNode?: boolean;
};

type CreateNodeResult = {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
};

export function useCreateNode() {
  const { addNodes, getNodes, setNodes } = useReactFlow();
  const captureFraming = useCaptureFraming();
  const createWithNodeData = useMutation(api.nodes.createWithNodeData);
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  const createNode = async ({
    node,
    position,
    initialValues = {},
    autoEdit = false,
    selectNewNode = true,
  }: CreateNodeOptions): Promise<CreateNodeResult> => {
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

    // Un repère de navigation naît sur la vue courante : le créer, c'est
    // vouloir mémoriser ce qu'on regarde, pas poser un cadrage vide à
    // renseigner ensuite. Uniquement sur une création vierge — un duplicata
    // passe ses values par `initialValues` et garde le cadrage de sa source.
    const capturedFraming =
      node.type === "viewport" && Object.keys(initialValues).length === 0
        ? captureFraming()
        : null;

    const values =
      Object.keys(initialValues).length > 0
        ? initialValues
        : capturedFraming
          ? { ...defaults, view: capturedFraming }
          : defaults;

    const {
      nodeDataId: _ignoredNodeDataId,
      color,
      variant,
      ...restData
    } = (node.data ?? {}) as {
      nodeDataId?: Id<"nodeDatas">;
      color?: colorsEnum;
      variant?: string;
      [key: string]: unknown;
    };
    const zIndex = nextTopZIndex(getNodes());

    let created: Array<{ nodeId: string; nodeDataId: Id<"nodeDatas"> }>;
    try {
      created = await trackCanvasSync(() =>
        createWithNodeData({
          nodes: [
            {
              node: {
                canvasId,
                type: (node.type ?? "default") as NodeType,
                position,
                width: node.measured?.width ?? node.width ?? 0,
                height: node.measured?.height ?? node.height ?? 0,
                zIndex,
                ...(color && { color }),
                variant: variant ?? "default",
                ...(node.parentId && { parentId: node.parentId }),
                ...(node.extent && {
                  extent: node.extent as
                    | "parent"
                    | Array<Array<number>>,
                }),
                ...(node.expandParent && { extendParent: true }),
                ...(Object.keys(restData).length > 0 && { data: restData }),
              },
              nodeDataValues: values,
              ...(templateId && { nodeDataTemplateId: templateId }),
            },
          ],
        }),
      );
    } catch (error) {
      toastError(error, "Could not add the node");
      throw error;
    }

    const { nodeId, nodeDataId } = created[0];

    // Marqué avant tout `addNodes` : le sync Convex → ReactFlow doit garder
    // ce node local tant que le serveur ne l'a pas renvoyé, et le sélectionner
    // à sa première apparition (cf. `pendingCreatedNodes`).
    markNodesAsPendingCreation([nodeId]);

    // Déselectionner tous les nodes (sauf si l'appelant veut préserver la
    // sélection en cours — cf. option `selectNewNode`).
    if (selectNewNode) {
      setNodes((nodes) => nodes.map((n) => ({ ...n, selected: false })));
    }

    // Au format de React Flow, on ajoute le node avec addNodes
    addNodes({
      ...node,
      id: nodeId,
      position,
      selected: selectNewNode,
      zIndex,
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
