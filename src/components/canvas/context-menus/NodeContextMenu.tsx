import prebuiltNodesConfig, {
  canNodeTypeBeCreated,
} from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/shadcn/dropdown-menu";
import type { Node } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useParams } from "@tanstack/react-router";
import type { Id } from "@/../convex/_generated/dataModel";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";

// Icons
import { HiOutlineTrash } from "react-icons/hi";
import {
  TbArrowLeftFromArc,
  TbCheck,
  TbCopyPlus,
  TbLayoutBoardSplit,
  TbPalette,
  TbSpaces,
} from "react-icons/tb";
import { useOwnsTemplate } from "@/stores/templatesStore";
import { useTemplateEditor } from "@/hooks/useTemplateEditor";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { useState } from "react";
import type { IconType } from "react-icons";
import MoveNodeToCanvasModal from "./MoveNodeToCanvasModal";
import { createPortal } from "react-dom";

type NodeSubMenuItem = {
  label: string;
  onClick: () => void | Promise<void>;
  preventAutoClose?: boolean;
};

type NodeOption = {
  hidden?: boolean;
  label: string;
  icon: IconType;
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
  const { deleteElements, updateNode } = useReactFlow();
  const { duplicateNode } = useDuplicateNode();
  const { updateCanvasNode } = useUpdateCanvasNode();
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });
  const updatePositionOrDimensions = useMutation(
    api.canvasNodes.updatePositionOrDimensions,
  );

  // Custom nodes : édition du template depuis le canvas, sans passer par les
  // settings. Masquée si le template n'est pas le mien — seul son
  // propriétaire peut le sauvegarder (requireOwnedTemplate), l'afficher
  // mènerait un viewer de canvas partagé droit à une erreur de permission.
  const templateId = xyNode.data?.templateId as string | undefined;
  const ownsTemplate = useOwnsTemplate(templateId);
  const { openTemplateEditor } = useTemplateEditor();

  const variants = prebuiltNodesConfig.find(
    (config) => config.node.type === xyNode.type,
  )?.variants;

  const availableColors = Object.entries(colors);
  const currentColor = (xyNode.data.color as colorsEnum) || "default";

  const nodeOptions: NodeOption[] = [
    {
      hidden: !variants || Object.keys(variants).length === 0,
      label: "Appearance",
      icon: TbSpaces,
      subMenu: Object.entries(variants || {}).map(
        ([variantKey, variantConfig]) => ({
          label: variantConfig.label,
          onClick: async () => {
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
            await updatePositionOrDimensions({
              canvasId,
              nodeChanges: [{ id: xyNode.id, dimensions }],
            });

            updateNode(xyNode.id, { resizing: false });
          },
        }),
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
      hidden: !templateId || !ownsTemplate,
      label: "Edit template",
      icon: TbLayoutBoardSplit,
      onClick: () => {
        if (templateId) openTemplateEditor(templateId);
      },
    },
    {
      hidden: !canNodeTypeBeCreated(xyNode.type),
      label: "Duplicate",
      icon: TbCopyPlus,
      onClick: () => {
        void duplicateNode(xyNode);
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
        deleteElements({ nodes: [xyNode] });
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
