import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useReactFlow, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { useParams } from "@tanstack/react-router";

import {
  RiAlignItemLeftLine,
  RiAlignItemRightLine,
  RiAlignItemTopLine,
  RiAlignItemBottomLine,
} from "react-icons/ri";
import { HiOutlineTrash } from "react-icons/hi";
import {
  TbArrowAutofitHeight,
  TbArrowAutofitWidth,
  TbCheck,
  TbKeyframeAlignCenter,
  TbPalette,
  TbPhoto,
  TbSpaces,
} from "react-icons/tb";
import { MdOutlineFitScreen } from "react-icons/md";
import { api } from "@/../convex/_generated/api";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export default function SelectionContextMenu({
  closeMenu,
  elements,
}: {
  closeMenu: () => void;
  elements: Node[] | object | null;
}) {
  const { deleteElements, updateNode } = useReactFlow();
  const { updateCanvasNode, updateCanvasNodes } = useUpdateCanvasNode();
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { canvasId }: { canvasId: Id<"canvases"> } = useParams({
    from: "/canvas/$canvasId",
  });
  const updatePositionOrDimensions = useMutation(
    api.canvasNodes.updatePositionOrDimensions,
  );
  const availableColors = Object.entries(colors);

  const imageNodes = Array.isArray(elements)
    ? elements.filter(
        (n) => n.type === "image" && n.data?.nodeDataId,
      )
    : [];
  const canMergeImages = imageNodes.length >= 2;

  // Variants common to all selected nodes. We match on the user-facing
  // label, not the raw key: the same appearance ("Preview", "Title") can
  // live under different keys per type — e.g. it's the `default` key on
  // document/table but the `preview` key on embed/app.
  const elementsArray = Array.isArray(elements) ? elements : [];
  const labelToKeyPerNode = elementsArray.map(
    (node) =>
      new Map(
        Object.entries(
          prebuiltNodesConfig.find((c) => c.node.type === node.type)
            ?.variants ?? {},
        ).map(([key, v]) => [v.label, key]),
      ),
  );
  const commonVariantLabels =
    labelToKeyPerNode.length === 0
      ? []
      : [...labelToKeyPerNode[0].keys()].filter((label) =>
          labelToKeyPerNode.every((m) => m.has(label)),
        );

  async function applyVariantToSelection(label: string) {
    if (!Array.isArray(elements) || elements.length === 0) return;

    // Resolve each node's own variant key (and dimensions) from the label.
    const changes = elements
      .map((node) => {
        const variants = prebuiltNodesConfig.find(
          (c) => c.node.type === node.type,
        )?.variants;
        if (!variants) return null;
        const entry = Object.entries(variants).find(
          ([, v]) => v.label === label,
        );
        if (!entry) return null;
        const [variantKey, variantConfig] = entry;
        return {
          nodeId: node.id,
          variantKey,
          dimensions: {
            width: variantConfig.defaultWidth,
            height: variantConfig.defaultHeight,
          },
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (changes.length === 0) return;

    // Mark resizing locally to shield the new size from the Convex →
    // ReactFlow sync until the mutation lands (mirrors NodeContextMenu).
    changes.forEach(({ nodeId, dimensions }) => {
      updateNode(nodeId, {
        width: dimensions.width,
        height: dimensions.height,
        resizing: true,
      });
    });

    void updateCanvasNodes(
      changes.map(({ nodeId, variantKey }) => ({
        nodeId,
        props: { variant: variantKey },
      })),
    );

    await updatePositionOrDimensions({
      canvasId,
      nodeChanges: changes.map(({ nodeId, dimensions }) => ({
        id: nodeId,
        dimensions,
      })),
    });

    changes.forEach(({ nodeId }) => updateNode(nodeId, { resizing: false }));
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
      const nodeDataId = node.data?.nodeDataId as Id<"nodeDatas"> | undefined;
      if (!nodeDataId) continue;
      const data = getNodeData(nodeDataId);
      const images = (data?.values?.images as
        | Array<Record<string, unknown>>
        | undefined) ?? [];
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

    // Clear images on source nodes before deleting them, otherwise the
    // cascade-delete (deleteNodeDataWithCascade) would wipe the R2 files
    // that are now referenced by the target node.
    await Promise.all(
      others.map((n) => {
        const id = n.data?.nodeDataId as Id<"nodeDatas"> | undefined;
        if (!id) return Promise.resolve();
        return updateNodeDataValues({ nodeDataId: id, values: { images: [] } });
      }),
    );

    deleteElements({ nodes: others.map((n) => ({ id: n.id })) });
  }

  async function alignSelectedNodes(
    alignment: "left" | "right" | "top" | "bottom",
  ) {
    if (!Array.isArray(elements)) return;

    let targetValue: number;

    switch (alignment) {
      case "left":
        // Trouve le x le plus petit (le plus à gauche)
        targetValue = Math.min(...elements.map((node) => node.position.x));
        elements.forEach((node) => {
          updateNode(node.id, {
            position: { ...node.position, x: targetValue },
          });
        });
        break;

      case "bottom":
        // Trouve le y + hauteur le plus grand (le plus en bas)
        targetValue = Math.max(
          ...elements.map((node) => {
            const height = node.measured?.height || node.height || 0;
            return node.position.y + height;
          }),
        );
        elements.forEach((node) => {
          const height = node.measured?.height || node.height || 0;
          updateNode(node.id, {
            position: { ...node.position, y: targetValue - height },
          });
        });
        break;

      case "right":
        // Trouve le x + largeur le plus grand (le plus à droite)
        targetValue = Math.max(
          ...elements.map((node) => {
            const width = node.measured?.width || node.width || 0;
            return node.position.x + width;
          }),
        );
        elements.forEach((node) => {
          const width = node.measured?.width || node.width || 0;
          updateNode(node.id, {
            position: { ...node.position, x: targetValue - width },
          });
        });
        break;

      case "top":
        // Trouve le y le plus petit (le plus en haut)
        targetValue = Math.min(...elements.map((node) => node.position.y));
        elements.forEach((node) => {
          updateNode(node.id, {
            position: { ...node.position, y: targetValue },
          });
        });
        break;
    }
  }

  async function uniformizeSelectedNodes(axis: "width" | "height") {
    // Récupère la plus grande largeur ou hauteur et la donne à tous les noeuds
    if (!Array.isArray(elements)) return;

    let targetValue: number;
    switch (axis) {
      case "width":
        targetValue = Math.max(
          ...elements.map((node) => node.measured?.width || node.width || 0),
        );
        break;
      case "height":
        targetValue = Math.max(
          ...elements.map((node) => node.measured?.height || node.height || 0),
        );
        break;
    }
    elements.forEach((node) => {
      updateNode(
        node.id,
        axis === "width" ? { width: targetValue } : { height: targetValue },
      );
    });
  }

  const alignements = [
    {
      label: "Top",
      icon: RiAlignItemTopLine,
      onClick: () => alignSelectedNodes("top"),
    },
    {
      label: "Right",
      icon: RiAlignItemRightLine,
      onClick: () => alignSelectedNodes("right"),
    },
    {
      label: "Bottom",
      icon: RiAlignItemBottomLine,
      onClick: () => alignSelectedNodes("bottom"),
    },
    {
      label: "Left",
      icon: RiAlignItemLeftLine,
      onClick: () => alignSelectedNodes("left"),
    },
  ];

  const uniformizations = [
    {
      label: "Same width",
      icon: TbArrowAutofitWidth,
      onClick: () => uniformizeSelectedNodes("width"),
    },
    {
      label: "Same height",
      icon: TbArrowAutofitHeight,
      onClick: () => uniformizeSelectedNodes("height"),
    },
  ];

  return (
    <>
      <DropdownMenuLabel className="whitespace-nowrap">
        Selection actions
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

      {/* Alignement
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <TbKeyframeAlignCenter /> Aligner
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {alignements.map(({ label, icon: Icon, onClick }, i) => (
              <DropdownMenuItem
                key={i}
                onClick={() => {
                  onClick();
                  closeMenu();
                }}
              >
                <Icon className="mr-2" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <MdOutlineFitScreen /> Uniformiser
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {uniformizations.map(({ label, icon: Icon, onClick }, i) => (
              <DropdownMenuItem
                key={i}
                onClick={() => {
                  onClick();
                  closeMenu();
                }}
              >
                <Icon className="mr-2" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub> */}

      {/* Variant */}
      {commonVariantLabels.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="whitespace-nowrap">
            <TbSpaces size={16} /> Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {commonVariantLabels.map((label) => (
              <DropdownMenuItem
                className="whitespace-nowrap"
                key={label}
                onClick={() => {
                  void applyVariantToSelection(label);
                  closeMenu();
                }}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* Couleur */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="whitespace-nowrap">
          <TbPalette size={16} /> Color
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <div className="grid grid-cols-5 gap-2 p-2">
            {availableColors.map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (!Array.isArray(elements)) return;
                  elements.forEach((node) => {
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
                  "border-border hover:border-primary/50",
                )}
                title={value.label}
              />
            ))}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

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

      {/* Suppression */}
      <DropdownMenuItem
        onClick={() => {
          deleteElements({ nodes: elements as Node[] });
          closeMenu();
        }}
      >
        <HiOutlineTrash />
        Delete
      </DropdownMenuItem>
    </>
  );
}
