import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { generateLlmId } from "@/../convex/lib/llmId";
import type { Node } from "@xyflow/react";
import type { colorsEnum, NodeType } from "@/types/domain";
import { getDefaultNodeDataValues } from "@/../convex/config/nodeConfig";
import { getDefaultValuesForTemplate } from "@/../convex/config/fieldConfig";
import { useParams } from "@tanstack/react-router";
import { useTemplatesStore } from "@/stores/templatesStore";
import { nextFrameZIndex, nextTopZIndex } from "@/lib/nodeLayering";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import {
  consumePendingCreation,
  markNodesAsPendingCreation,
} from "@/lib/pendingCreatedNodes";
import { addPendingNodeDatasToListQuery } from "@/lib/flowNodes";
import { pendingDocId } from "@/lib/pendingDocIds";
import { toastError } from "@/components/utils/errorUtils";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { recordUndo } from "@/stores/canvasHistoryStore";
import type { NodeDisplayOptions } from "@/../convex/schemas/nodesSchema";

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
  const { getNodes, setNodes } = useReactFlow();
  const createWithNodeData = useMutation(
    api.nodes.createWithNodeData,
  ).withOptimisticUpdate((localStore, { nodes }) => {
    if (nodes.length === 0) return;
    // nodeDatas factices, mêmes values que celles envoyées au serveur : le
    // contenu du node est rendu avant la confirmation (cf.
    // `addPendingNodeDatasToListQuery`).
    addPendingNodeDatasToListQuery(
      localStore,
      nodes[0].node.canvasId,
      nodes.flatMap((item): Doc<"nodeDatas">[] => {
        if (item.id === undefined) return [];
        return [
          {
            _id: pendingDocId<"nodeDatas">(item.id),
            _creationTime: Date.now(),
            canvasId: item.node.canvasId,
            type: item.node.type,
            updatedAt: Date.now(),
            values: item.nodeDataValues,
            ...(item.nodeDataTemplateId !== undefined && {
              templateId: item.nodeDataTemplateId,
            }),
          },
        ];
      }),
    );
  });
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });

  /**
   * Crée un node en local-first et retourne **aussitôt** son `nodeId` : le
   * node est déjà visible quand l'appel rend la main. `settled` résout à la
   * confirmation serveur (`{ nodeId, nodeDataId }`) et rejette en cas
   * d'échec (rollback local + toast déjà effectués dans le hook).
   *
   * Motif miroir de `useCreateEdge` : qui a besoin de l'id sans attendre
   * (ex. chaîner une edge) l'utilise directement, qui a besoin du
   * `nodeDataId` fait `await settled`.
   */
  const createNode = ({
    node,
    position,
    initialValues = {},
    autoEdit = false,
    selectNewNode = true,
  }: CreateNodeOptions): {
    nodeId: string;
    settled: Promise<CreateNodeResult>;
  } => {
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

    const {
      nodeDataId: _ignoredNodeDataId,
      color,
      variant,
      displayOptions,
      ...restData
    } = (node.data ?? {}) as {
      nodeDataId?: Id<"nodeDatas">;
      color?: colorsEnum;
      variant?: string;
      displayOptions?: NodeDisplayOptions;
      [key: string]: unknown;
    };
    // Une frame naît sous les nodes : elle est tracée autour de nodes
    // existants, la poser au-dessus les masquerait tous à l'instant du tracé.
    // Décidé ici et pas par l'appelant : c'est une propriété du type.
    const zIndex =
      node.type === "frame"
        ? nextFrameZIndex(getNodes())
        : nextTopZIndex(getNodes());

    // ── Local-first ─────────────────────────────────────────────────
    // Le llmId est généré côté client et passé à la mutation : le node et
    // son contenu s'affichent AVANT la confirmation serveur (le cache
    // optimiste fournit un nodeData factice `_id` `pending_<llmId>`), et le
    // serveur préserve l'id — idempotent sur retry, refus cross-canvas.
    const nodeId = generateLlmId();
    const fakeNodeDataId = pendingDocId<"nodeDatas">(nodeId);

    // Le registre pending garde ce node à travers les syncs intermédiaires
    // (listes serveur partielles) et force sa sélection à sa première
    // apparition serveur (cf. `pendingCreatedNodes`).
    markNodesAsPendingCreation([nodeId]);

    // Déselectionner tous les nodes (sauf si l'appelant veut préserver la
    // sélection en cours — cf. option `selectNewNode`).
    if (selectNewNode) {
      setNodes((nodes) => nodes.map((n) => ({ ...n, selected: false })));
    }

    // Add local immédiat, au format React Flow. Garde anti-collision : un
    // llmId déjà en état local (collision `generateLlmId`, double appel) ne
    // doit pas monter deux NodeWrapper sous la même key.
    const newNode: Node = {
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
        nodeDataId: fakeNodeDataId,
      },
    };
    setNodes((current) => {
      if (current.some((n) => n.id === nodeId)) {
        if (!selectNewNode) return current;
        return current.map((n) =>
          n.id === nodeId ? { ...n, selected: true } : n,
        );
      }
      return [...current, newNode];
    });

    // Toujours écrit, y compris à `null` : sans ça, un id non consommé (type
    // qui ne s'édite pas sur place) resterait dans le store. Posé avant la
    // réponse : un titre fraîchement créé est éditable immédiatement.
    useNodeEditorStore.getState().setEditingNodeId(autoEdit ? nodeId : null);

    // `settled` résout à la confirmation serveur ; en attendant, le node est
    // déjà visible (local-first ci-dessus) et `nodeId` est utilisable
    // aussitôt — c'est ce qui permet de chaîner une edge sans latence.
    const settled: Promise<CreateNodeResult> = trackCanvasSync(() =>
      createWithNodeData({
        nodes: [
          {
            id: nodeId,
            node: {
              canvasId,
              type: (node.type ?? "default") as NodeType,
              position,
              width: node.measured?.width ?? node.width ?? 0,
              height: node.measured?.height ?? node.height ?? 0,
              zIndex,
              ...(color && { color }),
              variant: variant ?? "default",
              ...(displayOptions && { displayOptions }),
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
    )
      .then((created) => {
        const { nodeDataId } = created[0];

        // Relier au vrai nodeData dès la réponse — no-op si le push serveur a
        // déjà remplacé le node local (même llmId).
        setNodes((current) => {
          const local = current.find((n) => n.id === nodeId);
          if (
            !local ||
            (local.data as { nodeDataId?: Id<"nodeDatas"> } | undefined)
              ?.nodeDataId === nodeDataId
          ) {
            return current;
          }
          return current.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, nodeDataId } } : n,
          );
        });

        // Enregistré APRÈS la confirmation serveur : un `trash` sur un node que le
        // serveur ne connaît pas encore échouerait. Annuler une création, c'est la
        // mettre à la corbeille — pas la supprimer —, donc la refaire rend le même
        // nodeData avec tout ce qui y a été saisi entre-temps.
        recordUndo(
          { kind: "trashNodes", nodeIds: [nodeId] },
          { kind: "untrashNodes", nodeIds: [nodeId] },
        );

        return { nodeId, nodeDataId };
      })
      .catch((error: unknown) => {
        // Rollback du local-first : le cache optimiste est rétabli par Convex,
        // le node local et le pending restent à notre charge.
        consumePendingCreation(nodeId);
        setNodes((current) => current.filter((n) => n.id !== nodeId));
        if (useNodeEditorStore.getState().editingNodeId === nodeId) {
          useNodeEditorStore.getState().setEditingNodeId(null);
        }
        toastError(error, "Could not add the node");
        throw error;
      });

    return { nodeId, settled };
  };

  return { createNode };
}
