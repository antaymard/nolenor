import prebuiltNodesConfig, {
  canNodeTypeBeCreated,
} from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
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
import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { getNodeCapabilities } from "@/../convex/config/nodeConfig";
import { fromXyNodesToCanvasNodes } from "@/lib/node-types-converter";
import { useNoleStore } from "@/stores/noleStore";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";
import { SHOW_DEV_ONLY_SETTINGS } from "@/lib/featureFlags";
import { getCommonDisplayOptions } from "@/lib/nodeDisplayOptions";
import type { NodeVariant } from "@/../convex/config/nodeConfig";
import DisplayOptionsMenuItems from "./DisplayOptionsMenuItems";

// Icons
import { HiOutlineTrash } from "react-icons/hi";
import {
  TbArrowLeftFromArc,
  TbBookmark,
  TbBookmarkOff,
  TbCheck,
  TbCopyPlus,
  TbLayoutBoardSplit,
  TbPalette,
  TbPaperclip,
  TbSpaces,
  TbStack2,
  TbUnlink,
} from "react-icons/tb";
import { useOwnsTemplate } from "@/stores/templatesStore";
import { useTemplateEditor } from "@/hooks/useTemplateEditor";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { useNodeLayering } from "@/hooks/useNodeLayering";
import { LAYER_COMMANDS } from "@/lib/nodeLayering";
import { useState, useMemo } from "react";
import type { IconType } from "react-icons";
import MoveNodeToCanvasModal from "./MoveNodeToCanvasModal";
import { createPortal } from "react-dom";
import { useDeleteCanvasElements } from "@/hooks/useDeleteCanvasElements";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useIsNodeBookmarked } from "@/stores/bookmarkedNodesStore";
import { useCanvasStore } from "@/stores/canvasStore";

type NodeSubMenuItem = {
  label: string;
  onClick: () => void | Promise<void>;
  preventAutoClose?: boolean;
};

type NodeOption = {
  hidden?: boolean;
  label: string;
  icon: IconType;
  shortcutHint?: React.ReactNode;
  subMenu?: NodeSubMenuItem[];
  customSubContent?: React.ReactNode;
  onClick?: () => void | Promise<void>;
  preventAutoClose?: boolean;
};

export default function NodeContextMenu({
  closeMenu,
  xyNode,
}: {
  closeMenu: () => void;
  position: { x: number; y: number };
  xyNode: Node;
}) {
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const { updateNode, getNodes } = useReactFlow();
  const { deleteCanvasElements } = useDeleteCanvasElements();
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  // `enabled: false` : poser un repère n'a pas besoin de lire la liste, et ce
  // menu se monte à chaque clic droit — on ne veut pas ouvrir une
  // souscription de plus à chaque fois.
  const {
    create: createBookmark,
    removeForNodes: removeBookmarksForNodes,
    canBookmark,
  } = useCanvasBookmarks({
    canvasId,
    enabled: false,
  });
  // L'état repéré vient du store et non de la query : il est déjà tenu à jour
  // pour la pastille du node (`useSyncBookmarkedNodes`, monté par
  // `CanvasFlow`), donc le menu le lit sans ouvrir de souscription de plus.
  const isBookmarked = useIsNodeBookmarked(xyNode.id);
  const { duplicateNode, duplicateNodes } = useDuplicateNode();
  const { updateCanvasNode } = useUpdateCanvasNode();
  const { applyLayerCommand } = useNodeLayering();
  const patchNodes = useMutation(api.nodes.patch);
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
  const templateId = xyNode.data?.templateId as string | undefined;
  const ownsTemplate = useOwnsTemplate(templateId);
  const { openTemplateEditor } = useTemplateEditor();

  const variants = prebuiltNodesConfig.find(
    (config) => config.node.type === xyNode.type,
  )?.variants;
  const variantEntries = Object.entries(variants ?? {});
  const displayOptionEntries = getCommonDisplayOptions([xyNode]);

  async function applyVariant(variantKey: string, variantConfig: NodeVariant) {
    updateCanvasNode({
      nodeId: xyNode.id,
      props: { variant: variantKey },
    });

    const dimensions = {
      width: variantConfig.defaultWidth,
      height: variantConfig.defaultHeight,
    };

    // Marquer resizing: true pour protéger du sync Convex → ReactFlow
    updateNode(xyNode.id, {
      width: dimensions.width,
      height: dimensions.height,
      resizing: true,
    });

    // Envoyer la mutation, puis libérer le flag resizing
    await patchNodes({
      updates: [
        {
          nodeId: xyNode.id,
          props: {
            width: dimensions.width,
            height: dimensions.height,
          },
        },
      ],
    });

    updateNode(xyNode.id, { resizing: false });
  }

  const availableColors = Object.entries(colors);
  const currentColor = (xyNode.data.color as colorsEnum) || "default";

  // Clic droit sur un node d'un groupe sélectionné → tout le groupe
  // (standard Figma/Miro, comme Duplicate) — avec la sémantique « bold » :
  // partiel → attache les manquants ; tout attaché → détache tout.
  const selectedNodes = getNodes().filter((node) => node.selected);
  const attachTargets = (
    xyNode.selected && selectedNodes.length > 1 ? selectedNodes : [xyNode]
  ).filter(
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

  const nodeOptions: NodeOption[] = [
    {
      // Variants (un choix exclusif) puis options d'affichage (cumulables,
      // indépendantes de la variante).
      hidden: variantEntries.length === 0 && displayOptionEntries.length === 0,
      label: "Appearance",
      icon: TbSpaces,
      customSubContent: (
        <>
          {variantEntries.map(([variantKey, variantConfig]) => (
            <DropdownMenuItem
              className="whitespace-nowrap"
              key={variantKey}
              onClick={() => {
                void applyVariant(variantKey, variantConfig);
                closeMenu();
              }}
            >
              {variantConfig.label}
            </DropdownMenuItem>
          ))}
          {variantEntries.length > 0 && displayOptionEntries.length > 0 && (
            <DropdownMenuSeparator />
          )}
          <DisplayOptionsMenuItems
            nodes={[xyNode]}
            entries={displayOptionEntries}
            onApplied={closeMenu}
          />
        </>
      ),
    },
    {
      label: "Color",
      icon: TbPalette,
      preventAutoClose: true,
      customSubContent: (
        <div className="grid grid-cols-5 gap-2 p-2">
          {availableColors.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                updateCanvasNode({
                  nodeId: xyNode.id,
                  props: { color: key as colorsEnum },
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
      ),
    },
    {
      label: "Layer",
      icon: TbStack2,
      subMenu: LAYER_COMMANDS.map(({ command, label }) => ({
        label,
        onClick: () => {
          applyLayerCommand(command, [xyNode.id]);
        },
      })),
    },
    {
      hidden: !templateId || !ownsTemplate || !SHOW_DEV_ONLY_SETTINGS,
      label: "Edit template",
      icon: TbLayoutBoardSplit,
      onClick: () => {
        if (templateId) openTemplateEditor(templateId);
      },
    },
    {
      hidden: attachTargets.length === 0,
      label: allAttachTargetsAttached ? "Detach from Nolë" : "Attach to Nolë",
      icon: allAttachTargetsAttached ? TbUnlink : TbPaperclip,
      shortcutHint: <Kbd>Alt + click</Kbd>,
      onClick: () => {
        handleAttachToNole();
      },
    },
    {
      // Le repère suit le node, frame comprise : rien à masquer par type — la
      // seule condition est d'avoir un compte à qui le rattacher.
      // Pas de shortcutHint : un bookmark se pose rarement, et les raccourcis
      // du canvas sont déjà denses.
      //
      // Bascule, et sur l'état que montre la pastille : un node déjà repéré
      // propose de ne plus l'être, pas de l'être deux fois. Le dé-repérage passe
      // par les llmid et pas par un `bookmarkId` parce que le node peut être
      // repéré par un repère `selection` qui en vise d'autres — il en sort
      // alors sans emporter ses voisins (cf. `removeForNodes` côté serveur).
      hidden: !canBookmark,
      label: isBookmarked ? "Remove bookmark" : "Bookmark",
      icon: isBookmarked ? TbBookmarkOff : TbBookmark,
      onClick: () => {
        if (isBookmarked) {
          void removeBookmarksForNodes([xyNode.id]);
        } else {
          void createBookmark({ kind: "node", nodeId: xyNode.id });
        }
      },
    },
    {
      hidden: !canNodeTypeBeCreated(xyNode.type),
      label: "Duplicate",
      icon: TbCopyPlus,
      shortcutHint: <Kbd>Ctrl + D</Kbd>,
      onClick: () => {
        // Clic droit sur un node d'un groupe sélectionné → tout le groupe
        // (standard Figma/Miro) ; sinon le seul node cliqué.
        const selectedNodes = getNodes().filter((node) => node.selected);
        if (xyNode.selected && selectedNodes.length > 1) {
          void duplicateNodes(selectedNodes);
        } else {
          void duplicateNode(xyNode);
        }
      },
    },
    {
      label: "Move to another canvas",
      icon: TbArrowLeftFromArc,
      preventAutoClose: true,
      onClick: () => {
        setIsMoveModalOpen(true);
      },
    },
    {
      label: "Delete",
      icon: HiOutlineTrash,
      onClick: () => {
        void deleteCanvasElements(
          { nodes: [xyNode] },
          { label: "Delete node" },
        );
      },
    },
  ];
  // On est déjà dans DropdownMenuContent

  return (
    <>
      <DropdownMenuLabel className="whitespace-nowrap">
        Block actions
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {nodeOptions
        .filter((option) => option.hidden !== true)
        .map((option, i) =>
          option.customSubContent ? (
            <DropdownMenuSub key={i}>
              <DropdownMenuSubTrigger className="whitespace-nowrap">
                {option.icon({ size: 16 })} {option.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {option.customSubContent}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : option.subMenu && option.subMenu.length > 0 ? (
            <DropdownMenuSub key={i}>
              <DropdownMenuSubTrigger className="whitespace-nowrap">
                {option.icon({ size: 16 })} {option.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {option.subMenu.map((sub, j) => (
                  <DropdownMenuItem
                    className="whitespace-nowrap"
                    key={j}
                    onClick={() => {
                      sub.onClick();
                      if (!sub.preventAutoClose) {
                        closeMenu();
                      }
                    }}
                  >
                    {sub.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem
              className="whitespace-nowrap"
              key={i}
              onClick={(e) => {
                if (option.preventAutoClose) {
                  e.preventDefault();
                  e.stopPropagation();
                }
                option.onClick?.();
                if (!option.preventAutoClose) {
                  closeMenu();
                }
              }}
            >
              {option.icon({ size: 16 })} {option.label}
              {option.shortcutHint && (
                <DropdownMenuShortcut className="flex items-center gap-1">
                  {option.shortcutHint}
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          ),
        )}

      {createPortal(
        <MoveNodeToCanvasModal
          open={isMoveModalOpen}
          onOpenChange={setIsMoveModalOpen}
          nodeCanvasId={xyNode.id}
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
