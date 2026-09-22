import { useMemo } from "react";
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
import { useReactFlow, type Node } from "@xyflow/react";
import { useMutation } from "convex/react";

import { HiOutlineTrash } from "react-icons/hi";
import {
  TbBookmark,
  TbBookmarkOff,
  TbCopyPlus,
  TbPalette,
  TbPaperclip,
  TbPhoto,
  TbSpaces,
  TbStack2,
  TbUnlink,
} from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { getNodeCapabilities } from "@/../convex/config/nodeConfig";
import { MAX_SELECTION_NODE_IDS } from "@/../convex/schemas/canvasBookmarksSchema";
import { fromXyNodesToCanvasNodes } from "@/lib/node-types-converter";
import { useNoleStore } from "@/stores/noleStore";
import prebuiltNodesConfig from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { useNodeLayering } from "@/hooks/useNodeLayering";
import { LAYER_COMMANDS } from "@/lib/nodeLayering";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useDuplicateNode } from "@/hooks/useDuplicateNode";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { getNodeDataId } from "@/lib/nodeIdentity";
import { useDeleteCanvasElements } from "@/hooks/useDeleteCanvasElements";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useAreNodesBookmarked } from "@/stores/bookmarkedNodesStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useBookmarkNameDialog } from "./useBookmarkNameDialog";

export default function SelectionContextMenu({
  closeMenu,
  elements,
}: {
  closeMenu: () => void;
  elements: Node[] | object | null;
}) {
  const { updateNode } = useReactFlow();
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
  const { startBookmark, dialog: bookmarkNameDialog } = useBookmarkNameDialog(
    createBookmark,
  );
  const { duplicateNodes } = useDuplicateNode();
  const { updateCanvasNode, updateCanvasNodes } = useUpdateCanvasNode();
  const { applyLayerCommand } = useNodeLayering();
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const patchNodes = useMutation(api.nodes.patch);
  const availableColors = Object.entries(colors);
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

  const imageNodes = Array.isArray(elements)
    ? elements.filter((n) => n.type === "image" && n.data?.nodeDataId)
    : [];
  const canMergeImages = imageNodes.length >= 2;

  const elementsArray = Array.isArray(elements) ? elements : [];

  // Ce que le repère de sélection visera, borné au même plafond que le serveur
  // (`normalizeTarget`) : le compte annoncé par le menu et le dialogue est
  // celui qui sera réellement repéré, pas un compte que le serveur rognerait
  // en silence. Le même tableau sert à la bascule, pour que « tout repéré »
  // parle bien de ce sur quoi le clic agira.
  const bookmarkNodeIds = elementsArray
    .slice(0, MAX_SELECTION_NODE_IDS)
    .map((node) => node.id);
  // Sémantique « gras » : une sélection partiellement repérée achève de tout
  // repérer au premier clic, et seul le clic suivant — sur un état devenu
  // homogène — dé-repère tout.
  const allNodesBookmarked = useAreNodesBookmarked(bookmarkNodeIds);

  // Variants common to all selected nodes. We match on the user-facing
  // label, not the raw key: the same appearance ("Preview", "Title") can
  // live under different keys per type — e.g. it's the `default` key on
  // document/table but the `preview` key on app.
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

    await patchNodes({
      updates: changes.map(({ nodeId, dimensions }) => ({
        nodeId,
        props: { width: dimensions.width, height: dimensions.height },
      })),
    });

    changes.forEach(({ nodeId }) => updateNode(nodeId, { resizing: false }));
  }

  // Sémantique « bold » : partiel → attache les manquants ; tout
  // attaché → détache tout.
  const attachTargets = elementsArray.filter(
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
      <DropdownMenuLabel className="whitespace-nowrap">
        Selection actions
      </DropdownMenuLabel>
      <DropdownMenuSeparator />

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
                if (!Array.isArray(elements)) return;
                applyLayerCommand(
                  command,
                  elements.map((node) => node.id),
                );
                closeMenu();
              }}
            >
              {label}
            </DropdownMenuItem>
          ))}
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
          position serait restée sur le vide laissé derrière.

          Bascule à la manière du gras sur une sélection de texte : tant que
          tous les nodes ne sont pas repérés, le clic les repère tous (pas de
          dialogue de nommage sur le retrait, il n'y a rien à nommer) ; une
          fois l'état homogène, le clic suivant les dé-repère tous — y compris
          ceux qui l'étaient par un autre repère, qu'il soit `node` ou
          `selection` (cf. `removeForNodes`). */}
      {canBookmark && bookmarkNodeIds.length > 0 && (
        <DropdownMenuItem
          className="whitespace-nowrap"
          onClick={() => {
            if (allNodesBookmarked) {
              void removeBookmarksForNodes(bookmarkNodeIds);
            } else {
              startBookmark({ kind: "selection", nodeIds: bookmarkNodeIds });
            }
            closeMenu();
          }}
        >
          {allNodesBookmarked ? <TbBookmarkOff /> : <TbBookmark />}
          {allNodesBookmarked ? "Remove bookmarks" : "Bookmark selection"} (
          {bookmarkNodeIds.length})
        </DropdownMenuItem>
      )}

      {/* Duplication */}
      <DropdownMenuItem
        onClick={() => {
          if (Array.isArray(elements)) {
            void duplicateNodes(elements);
          }
          closeMenu();
        }}
      >
        <TbCopyPlus />
        Duplicate
        <DropdownMenuShortcut className="flex items-center gap-1">
          <Kbd>Ctrl + D</Kbd>
        </DropdownMenuShortcut>
      </DropdownMenuItem>

      {/* Suppression */}
      <DropdownMenuItem
        onClick={() => {
          void deleteCanvasElements(
            { nodes: elements as Node[] },
            { label: "Delete selection" },
          );
          closeMenu();
        }}
      >
        <HiOutlineTrash />
        Delete
      </DropdownMenuItem>

      {bookmarkNameDialog}
    </>
  );
}
