import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Kbd } from "@/components/shadcn/kbd";
import type { Node } from "@xyflow/react";

import { HiOutlineTrash } from "react-icons/hi";
import {
  TbArrowLeftFromArc,
  TbBookmark,
  TbBookmarkOff,
  TbCheck,
  TbCopyPlus,
  TbFrameOff,
  TbLayoutBoardSplit,
  TbPalette,
  TbPaperclip,
  TbPhoto,
  TbStack2,
  TbUnlink,
} from "react-icons/tb";
import {
  getNodeCapabilities,
  nodeDataConfig,
} from "@/../convex/config/nodeConfig";
import { canNodeTypeBeCreated } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { MAX_SELECTION_NODE_IDS } from "@/../convex/schemas/canvasBookmarksSchema";
import { fromXyNodesToCanvasNodes } from "@/lib/node-types-converter";
import { useNoleStore } from "@/stores/noleStore";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { useNodeLayering } from "@/hooks/useNodeLayering";
import { LAYER_COMMANDS } from "@/lib/nodeLayering";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { colors, colorSwatchStyle, resolveColor } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { getNodeDataId } from "@/lib/nodeIdentity";
import { SHOW_DEV_ONLY_SETTINGS } from "@/lib/featureFlags";
import { useOwnsTemplate } from "@/stores/templatesStore";
import { useTemplateEditor } from "@/hooks/useTemplateEditor";
import { useDeleteCanvasElements } from "@/hooks/useDeleteCanvasElements";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useAreNodesBookmarked } from "@/stores/bookmarkedNodesStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useRemoveFromFrame } from "@/hooks/useRemoveFromFrame";
import CopyNodeIdsSubMenu from "./CopyNodeIdsSubMenu";
import AppearanceMenu from "./AppearanceMenu";
import ArrangeMenu from "./ArrangeMenu";
import MoveNodeToCanvasModal from "./MoveNodeToCanvasModal";

/**
 * Menu contextuel des nodes : un clic droit sur un node seul l'ouvre avec ce
 * seul node, un clic droit sur une sélection avec tout le groupe (cf.
 * `useContextMenu`). Un node seul n'est qu'une sélection de taille 1 : toutes
 * les actions agissent sur la liste, et seules quelques-unes dépendent du
 * nombre — l'alignement et la fusion d'images en demandent au moins deux,
 * l'édition de template n'a de sens que pour un node.
 */
export default function NodesContextMenu({
  closeMenu,
  nodes,
}: {
  closeMenu: () => void;
  nodes: Node[];
}) {
  const isSingle = nodes.length === 1;
  const singleNode = isSingle ? nodes[0] : undefined;
  const nodeIds = nodes.map((node) => node.id);

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const { deleteCanvasElements } = useDeleteCanvasElements();
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  // Écriture seule : ce menu se remonte à chaque clic droit, inutile d'ouvrir
  // une souscription à la liste juste pour y ajouter une ligne.
  const {
    create: createBookmark,
    removeForNodes: removeBookmarksForNodes,
    canBookmark,
  } = useCanvasBookmarks({
    canvasId,
    enabled: false,
  });
  const { duplicateNodes } = useDuplicateNode();
  const { updateCanvasNode } = useUpdateCanvasNode();
  const { applyLayerCommand } = useNodeLayering();
  const { removeFromFrame } = useRemoveFromFrame();
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const availableColors = Object.entries(colors).filter(
    ([key]) => key !== "default",
  );
  const addNoleAttachments = useNoleStore((state) => state.addAttachments);
  const removeNoleAttachments = useNoleStore(
    (state) => state.removeAttachments,
  );
  const attachedNodeIds = useNoleStore((state) =>
    state.attachedNodes.map((n) => n.id).join(","),
  );
  const attachedIds = useMemo(
    () => new Set(attachedNodeIds ? attachedNodeIds.split(",") : []),
    [attachedNodeIds],
  );

  // Custom nodes : édition du template depuis le canvas, sans passer par les
  // settings. Masquée si le template n'est pas le mien — seul son
  // propriétaire peut le sauvegarder (requireOwnedTemplate), l'afficher
  // mènerait un viewer de canvas partagé droit à une erreur de permission.
  // Masquée aussi hors dev : l'éditeur de template qu'elle ouvre est la même
  // surface que la page settings mise de côté (cf. lib/featureFlags.ts).
  const templateId = singleNode?.data?.templateId as string | undefined;
  const ownsTemplate = useOwnsTemplate(templateId);
  const { openTemplateEditor } = useTemplateEditor();
  const canEditTemplate =
    !!templateId && ownsTemplate && SHOW_DEV_ONLY_SETTINGS;

  // La pastille cochée n'a de sens que si tous les nodes partagent la même
  // couleur.
  const nodeColors = new Set(
    nodes.map((node) =>
      resolveColor(
        node.data.color as string | undefined,
        node.type === "frame",
      ),
    ),
  );
  const currentColor = nodeColors.size === 1 ? [...nodeColors][0] : undefined;

  const imageNodes = nodes.filter(
    (n) => n.type === "image" && n.data?.nodeDataId,
  );
  const canMergeImages = imageNodes.length >= 2;

  const framedNodeIds = nodes
    .filter((node) => node.parentId)
    .map((node) => node.id);

  const canDuplicate = nodes.some((node) => canNodeTypeBeCreated(node.type));

  // Détail de la sélection par type, du plus nombreux au moins nombreux,
  // pour la pastille de compte de l'en-tête.
  const countsByType = Object.entries(
    nodes.reduce<Record<string, number>>((acc, node) => {
      const type = node.type ?? "unknown";
      acc[type] = (acc[type] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort(([, a], [, b]) => b - a);

  // Ce que le repère de sélection visera, borné au même plafond que le serveur
  // (`normalizeTarget`) : le compte annoncé par le menu est
  // celui qui sera réellement repéré, pas un compte que le serveur rognerait
  // en silence. Le même tableau sert à la bascule, pour que « tout repéré »
  // parle bien de ce sur quoi le clic agira.
  const bookmarkNodeIds = nodeIds.slice(0, MAX_SELECTION_NODE_IDS);
  // Sémantique « gras » : une sélection partiellement repérée achève de tout
  // repérer au premier clic, et seul le clic suivant — sur un état devenu
  // homogène — dé-repère tout.
  const allNodesBookmarked = useAreNodesBookmarked(bookmarkNodeIds);

  // Sémantique « bold » : partiel → attache les manquants ; tout
  // attaché → détache tout.
  const attachTargets = nodes.filter(
    (node) => node.type && getNodeCapabilities(node.type).agent.readable,
  );
  const allAttachTargetsAttached =
    attachTargets.length > 0 &&
    attachTargets.every((node) => attachedIds.has(node.id));

  function handleAttachToNole() {
    if (allAttachTargetsAttached) {
      removeNoleAttachments([
        { type: "node", ids: attachTargets.map((node) => node.id) },
      ]);
    } else {
      addNoleAttachments(
        {
          nodes: fromXyNodesToCanvasNodes(
            attachTargets.filter((node) => !attachedIds.has(node.id)),
          ),
        },
        false,
      );
    }
  }

  // Le repère suit le ou les nodes, frame comprise. Un node seul pose un
  // repère `node`, plusieurs un repère `selection` — sans nom, le panneau
  // affiche « N nodes » et on renomme depuis lui.
  //
  // Le dé-repérage passe par les llmid et pas par un `bookmarkId` parce qu'un
  // node peut être repéré par un repère `selection` qui en vise d'autres — il
  // en sort alors sans emporter ses voisins (cf. `removeForNodes` côté
  // serveur).
  function handleToggleBookmark() {
    if (allNodesBookmarked) {
      void removeBookmarksForNodes(bookmarkNodeIds);
    } else if (singleNode) {
      void createBookmark({ kind: "node", nodeId: singleNode.id });
    } else {
      void createBookmark({ kind: "selection", nodeIds: bookmarkNodeIds });
    }
  }

  async function mergeImageNodes() {
    if (!canMergeImages) return;

    const getNodeData = useNodeDataStore.getState().getNodeData;

    // Topmost-leftmost wins (smallest y, then smallest x).
    const sorted = [...imageNodes].sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y;
      return a.position.x - b.position.x;
    });
    const target = sorted[0];
    const others = sorted.slice(1);

    const seen = new Set<string>();
    const mergedImages: Array<Record<string, unknown>> = [];
    for (const node of sorted) {
      const nodeDataId = getNodeDataId(node);
      if (!nodeDataId) continue;
      const data = getNodeData(nodeDataId);
      const images =
        (data?.values?.images as Array<Record<string, unknown>> | undefined) ??
        [];
      for (const img of images) {
        const url = typeof img?.url === "string" ? img.url : undefined;
        if (!url || seen.has(url)) continue;
        seen.add(url);
        mergedImages.push(img);
      }
    }

    const targetNodeDataId = target.data?.nodeDataId as Id<"nodeDatas">;
    await updateNodeDataValues({
      nodeDataId: targetNodeDataId,
      values: { images: mergedImages },
    });

    // Les sources sont supprimées telles quelles : la cascade ne retire un
    // fichier R2 que si plus aucun node ne le référence, et le node cible
    // vient précisément d'en prendre la référence ci-dessus. Les vider
    // d'abord n'ajoutait qu'un snapshot de version inutile.
    // Hors pile d'annulation : la fusion des images qui précède n'est pas
    // annulable (c'est une écriture de contenu), donc rendre les sources
    // seules laisserait les images en double. Une demi-annulation est pire
    // que pas d'annulation.
    await deleteCanvasElements(
      { nodes: others.map((n) => ({ id: n.id })) },
      { undoable: false },
    );
  }

  return (
    <>
      <DropdownMenuLabel className="flex items-center justify-between gap-3 whitespace-nowrap">
        {isSingle ? "Block actions" : "Selection actions"}
        {!isSingle && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground cursor-default">
                {nodes.length}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">
              <ul className="flex flex-col gap-0.5">
                {countsByType.map(([type, count]) => (
                  <li key={type} className="flex justify-between gap-4">
                    <span>
                      {nodeDataConfig.find((config) => config.type === type)
                        ?.label ?? type}
                    </span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

      {/* Alignement et distribution, suggérés selon la forme de la
          sélection. Rien sous deux nodes. */}
      <ArrangeMenu nodes={nodes} closeMenu={closeMenu} />

      <AppearanceMenu nodes={nodes} closeMenu={closeMenu} />

      {/* Couleur */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbPalette size={16} /> Color
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <div className="grid grid-cols-6 gap-2 p-2">
            {availableColors.map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  nodes.forEach((node) => {
                    updateCanvasNode({
                      nodeId: node.id,
                      props: { color: key as colorsEnum },
                    });
                  });
                  closeMenu();
                }}
                className={cn(
                  "relative w-10 h-10 rounded-full border-2 transition-all hover:scale-110",
                  value.nodeBg,
                  currentColor === key
                    ? "border-primary shadow-md"
                    : "border-border hover:border-primary/50",
                )}
                title={value.label}
                style={colorSwatchStyle(key)}
              >
                {currentColor === key && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <TbCheck
                      className="w-5 h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                      strokeWidth={3}
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {/* Plan (z-index) */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbStack2 size={16} /> Layer
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {LAYER_COMMANDS.map(({ command, label }) => (
            <DropdownMenuItem
              className="whitespace-nowrap"
              key={command}
              onClick={() => {
                applyLayerCommand(command, nodeIds);
                closeMenu();
              }}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {canEditTemplate && (
        <DropdownMenuItem
          className="whitespace-nowrap"
          onClick={() => {
            if (templateId) openTemplateEditor(templateId);
            closeMenu();
          }}
        >
          <TbLayoutBoardSplit />
          Edit template
        </DropdownMenuItem>
      )}

      {canMergeImages && (
        <DropdownMenuItem
          onClick={() => {
            void mergeImageNodes();
            closeMenu();
          }}
        >
          <TbPhoto />
          Merge images ({imageNodes.length})
        </DropdownMenuItem>
      )}

      {/* Attachement Nolë */}
      {attachTargets.length > 0 && (
        <DropdownMenuItem
          className="whitespace-nowrap"
          onClick={() => {
            handleAttachToNole();
            closeMenu();
          }}
        >
          {allAttachTargetsAttached ? <TbUnlink /> : <TbPaperclip />}
          {allAttachTargetsAttached ? "Detach from Nolë" : "Attach to Nolë"}
          <DropdownMenuShortcut className="flex items-center gap-1">
            <Kbd>Alt + click</Kbd>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      )}

      {/* Repère de navigation. Sur des nodes et pas sur le cadrage courant :
          le repère suit alors le groupe quand on le déplace, là où une
          position serait restée sur le vide laissé derrière. Pas de
          raccourci : un bookmark se pose rarement, et les raccourcis du
          canvas sont déjà denses. */}
      {canBookmark && bookmarkNodeIds.length > 0 && (
        <DropdownMenuItem
          className="whitespace-nowrap"
          onClick={() => {
            handleToggleBookmark();
            closeMenu();
          }}
        >
          {allNodesBookmarked ? <TbBookmarkOff /> : <TbBookmark />}
          {isSingle
            ? allNodesBookmarked
              ? "Remove bookmark"
              : "Bookmark"
            : `${allNodesBookmarked ? "Remove bookmarks" : "Bookmark selection"} (${bookmarkNodeIds.length})`}
        </DropdownMenuItem>
      )}

      {/* Sortie de frame : posés à côté d'elle, reliés à elle (cf.
          `useRemoveFromFrame`). Ne vise que ceux qui sont dans une frame. */}
      {framedNodeIds.length > 0 && (
        <DropdownMenuItem
          className="whitespace-nowrap"
          onClick={() => {
            removeFromFrame(framedNodeIds);
            closeMenu();
          }}
        >
          <TbFrameOff />
          Remove from frame
          {framedNodeIds.length !== nodes.length &&
            ` (${framedNodeIds.length})`}
        </DropdownMenuItem>
      )}

      {/* Duplication */}
      {canDuplicate && (
        <DropdownMenuItem
          onClick={() => {
            void duplicateNodes(nodes);
            closeMenu();
          }}
        >
          <TbCopyPlus />
          Duplicate
          <DropdownMenuShortcut className="flex items-center gap-1">
            <Kbd>Ctrl + D</Kbd>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      )}

      {/* Ids pour un agent extérieur (MCP) */}
      <CopyNodeIdsSubMenu nodeIds={nodeIds} closeMenu={closeMenu} />

      {/* Vers un autre canvas : la sélection part entière, connexions
          internes comprises (cf. `moveNodes`). */}
      <DropdownMenuItem
        className="whitespace-nowrap"
        onClick={(e) => {
          // Le menu reste monté : c'est lui qui porte la modale.
          e.preventDefault();
          e.stopPropagation();
          setIsMoveModalOpen(true);
        }}
      >
        <TbArrowLeftFromArc />
        Move to another canvas
      </DropdownMenuItem>

      {/* Suppression */}
      <DropdownMenuItem
        onClick={() => {
          void deleteCanvasElements(
            { nodes },
            { label: isSingle ? "Delete node" : "Delete selection" },
          );
          closeMenu();
        }}
      >
        <HiOutlineTrash />
        Delete
      </DropdownMenuItem>

      {createPortal(
        <MoveNodeToCanvasModal
          open={isMoveModalOpen}
          onOpenChange={setIsMoveModalOpen}
          nodeIds={nodeIds}
          onSuccess={() => {
            setIsMoveModalOpen(false);
            closeMenu();
          }}
        />,
        document.body,
      )}
    </>
  );
}
