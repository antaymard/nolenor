import { useCallback, useRef } from "react";
import { useHotkey, type LetterKey } from "@tanstack/react-hotkeys";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCommandCenterStore } from "@/stores/commandCenterStore";
import { useSlideshowStore } from "@/stores/slideshowStore";
import { useCreateNode } from "./useCreateNode";
import { useCanvasPointerPosition } from "./useCanvasPointerPosition";
import { shortcutCreatableNodes } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import type { PrebuiltNodeConfig } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import type { NodeType } from "@/types/domain";

type ShortcutNodeConfig = PrebuiltNodeConfig & { creationShortcut: LetterKey };

/**
 * Le mapping vit dans `prebuiltNodesConfig` (à côté du label et de l'icône) ;
 * on le résout à l'import pour que les bindings n'aient jamais de touche
 * fantôme. Retirer un `creationShortcut` sans retirer son binding est une
 * erreur de configuration, et elle doit se voir tout de suite.
 */
function requireShortcutConfig(type: NodeType): ShortcutNodeConfig {
  const config = shortcutCreatableNodes.find((item) => item.type === type);
  if (!config?.creationShortcut) {
    throw new Error(
      `[useCreateNodeHotkeys] le type "${type}" n'a pas de creationShortcut dans prebuiltNodesConfig.`,
    );
  }
  return config as ShortcutNodeConfig;
}

const TITLE = requireShortcutConfig("title");
const BLOCKNOTE = requireShortcutConfig("blocknote");
const IMAGE = requireShortcutConfig("image");
const TABLE = requireShortcutConfig("table");

function useCreateNodeShortcut(
  config: ShortcutNodeConfig,
  createNodeAtPointer: (config: ShortcutNodeConfig) => void,
  enabled: boolean,
) {
  useHotkey(
    config.creationShortcut,
    (event) => {
      // Une touche maintenue ne doit pas empiler les nodes au même point :
      // `requireReset` est faux par défaut, donc l'auto-répétition rejoue le
      // binding.
      if (event.repeat) return;
      createNodeAtPointer(config);
    },
    {
      enabled,
      // Explicite plutôt que laissé à l'heuristique de la lib (« vrai pour les
      // touches simples ») : écrire « t » dans un champ, une cellule ou un
      // contenteditable ne doit jamais créer un node.
      ignoreInputs: true,
    },
  );
}

/**
 * Crée un node à l'endroit du curseur à la frappe d'une lettre : T titre,
 * B blocknote, I image, A table. Le node est posé centré sur le pointeur,
 * sélectionné et au sommet de la pile — soit exactement ce que fait le menu
 * « Add a block », dont il partage le mapping (`creationShortcut`).
 *
 * Les bindings sont nus : `matchesKeyboardEvent` compare les modificateurs à
 * l'identique, donc Ctrl+A, Cmd+I ou Shift+T ne déclenchent rien.
 *
 * Les hooks ne pouvant pas être appelés en boucle sur une liste de longueur
 * variable, les quatre bindings sont dépliés — même parade que
 * `useHotspotHotkeys`.
 *
 * Doit être appelé à l'intérieur de la route canvas et d'un `ReactFlowProvider`
 * (contrainte de `useCreateNode`).
 */
export function useCreateNodeHotkeys({
  canEdit,
  isTouch,
}: {
  canEdit: boolean;
  isTouch: boolean;
}) {
  const { createNode } = useCreateNode();
  const { getPointerFlowPosition } = useCanvasPointerPosition();

  const focus = useCanvasStore((state) => state.focus);
  const isSearchModalOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const isCommandCenterOpen = useCommandCenterStore((state) => state.isOpen);
  const isSlideshowPlaying = useSlideshowStore(
    (state) => state.playback.status === "playing",
  );

  // `createNode` est asynchrone (mutation Convex) : sans ce verrou, deux frappes
  // rapprochées posent deux nodes exactement au même point.
  const isCreatingRef = useRef(false);

  const enabled =
    canEdit &&
    !isTouch &&
    // Test positif, comme l'impose le commentaire de `canvasStore` : toute
    // nouvelle valeur de `focus` doit désactiver les raccourcis du canvas.
    focus === "canvas" &&
    // `ignoreInputs` ne couvre pas le cas où le focus a quitté l'input tout en
    // restant dans la modale.
    !isSearchModalOpen &&
    !isCommandCenterOpen &&
    // Les flèches sont déjà captées par la barre de progression : on ne crée
    // rien en pleine présentation.
    !isSlideshowPlaying;

  const createNodeAtPointer = useCallback(
    (config: ShortcutNodeConfig) => {
      if (isCreatingRef.current) return;

      const nodeToCreate = { ...config.node };
      // Même override que `AddBlockMenuContent` : c'est la variante par défaut
      // qui donne les dimensions réellement posées, donc le centrage se calcule
      // après elle.
      if (config.variants?.default) {
        nodeToCreate.height = config.variants.default.defaultHeight;
        nodeToCreate.width = config.variants.default.defaultWidth;
      }

      const point = getPointerFlowPosition();

      isCreatingRef.current = true;
      void createNode({
        node: nodeToCreate,
        position: {
          x: point.x - (nodeToCreate.width ?? 0) / 2,
          y: point.y - (nodeToCreate.height ?? 0) / 2,
        },
      }).finally(() => {
        isCreatingRef.current = false;
      });
    },
    [createNode, getPointerFlowPosition],
  );

  useCreateNodeShortcut(TITLE, createNodeAtPointer, enabled);
  useCreateNodeShortcut(BLOCKNOTE, createNodeAtPointer, enabled);
  useCreateNodeShortcut(IMAGE, createNodeAtPointer, enabled);
  useCreateNodeShortcut(TABLE, createNodeAtPointer, enabled);
}
