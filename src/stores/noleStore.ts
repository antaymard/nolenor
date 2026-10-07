import type { Dispatch, SetStateAction } from "react";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Canvas } from "@/types";
import type { CanvasNode, ChatModelValues } from "@/types/convex";
import { useShallow } from "zustand/react/shallow";

export type NolePanelLayout = "minimized" | "expanded";

/**
 * Les deux composers de Nolë et leur brouillon : celui du panel (la
 * conversation ouverte) et celui de l'omnibar (une demande sans conversation).
 */
export type NoleDraft = "panel" | "omnibar";

export const NOLE_DRAFT_FIELD = {
  panel: "userInput",
  omnibar: "omnibarInput",
} as const satisfies Record<NoleDraft, keyof NoleStore>;

const NOLE_DRAFT_SETTER = {
  panel: "setUserInput",
  omnibar: "setOmnibarInput",
} as const satisfies Record<NoleDraft, keyof NoleStore>;

/** Choix de modèle explicite, rattaché à une conversation. */
export type NoleModelSelection = {
  threadKey: string;
  model: ChatModelValues;
};

interface NoleStore {
  canvas: Omit<Canvas, "nodes" | "edges"> | null;
  panelLayout: NolePanelLayout;
  activeThreadId: string | null;
  // Vit ici, et non dans le hook, pour survivre au démontage du panel : celui-ci
  // est en rendu conditionnel, le réduire détruirait le choix de l'utilisateur.
  modelSelection: NoleModelSelection | null;
  // Le brouillon du composer vit ici, et non dans `useNoleChat`, pour que la
  // frappe ne re-rende pas tout ce que ce hook alimente. Il est monté par cinq
  // surfaces, dont le provider de contexte mobile : un `useState` local y
  // faisait re-rendre, à chaque caractère, l'en-tête, le sélecteur de
  // conversation, le badge de stats et l'overlay de node du canvas.
  //
  // Deuxième raison, celle qui rend le découpage possible : `sendCurrentMessage`
  // lit le brouillon. Tant qu'il le lisait depuis un state réactif, son
  // `useCallback` changeait d'identité à chaque frappe et la propageait à tous
  // ses consommateurs — aucune mémoïsation en aval n'y résistait.
  userInput: string;
  // Le brouillon de l'omnibar, distinct de celui du panel : une demande sans
  // conversation n'est pas un message de la conversation ouverte. Dans le
  // store pour la même raison que la dictée ci-dessous, qui l'écrit aussi.
  omnibarInput: string;
  // Le modèle choisi dans l'omnibar ; `null` = le défaut du profil. Pas de
  // thread auquel le rattacher : c'est le serveur qui le choisira.
  omnibarModel: ChatModelValues | null;
  attachedNodes: CanvasNode[];
  attachedPosition: { x: number; y: number } | null;

  setCanvas: (canvas: Canvas) => void;
  setPanelLayout: (layout: NolePanelLayout) => void;
  togglePanelLayout: () => void;
  // null → on retombe sur le thread initial résolu par useNoleThread.
  setActiveThreadId: (id: string | null) => void;
  // null → aucun choix explicite, on retombe sur la résolution par défaut.
  setModelSelection: (selection: NoleModelSelection | null) => void;
  // Signature de `useState` : la dictée met à jour le brouillon en fonction du
  // texte déjà saisi (`prev => prev + transcription`).
  setUserInput: Dispatch<SetStateAction<string>>;
  setOmnibarInput: Dispatch<SetStateAction<string>>;
  setOmnibarModel: (model: ChatModelValues | null) => void;
  addAttachments: (
    attachments: { nodes?: CanvasNode[]; position?: { x: number; y: number } },
    removeIfPresent?: boolean,
  ) => void;
  removeAttachments: (
    attachments: {
      type: "node" | "position";
      ids?: string[]; // Null if position
    }[],
  ) => void;
  resetAttachments: () => void;
}

export const useNoleStore = create<NoleStore>()(
  devtools(
    (set, get) => ({
      canvas: null,
      panelLayout: "minimized",
      activeThreadId: null,
      modelSelection: null,
      userInput: "",
      omnibarInput: "",
      omnibarModel: null,
      attachedNodes: [],
      attachedPosition: null,

      setCanvas: (canvas: Canvas) => {
        set({ canvas });
      },

      setPanelLayout: (layout: NolePanelLayout) => {
        set({ panelLayout: layout });
      },

      setActiveThreadId: (id: string | null) => {
        set({ activeThreadId: id });
      },

      setModelSelection: (selection: NoleModelSelection | null) => {
        set({ modelSelection: selection });
      },

      setUserInput: (value) => {
        set((state) => ({
          userInput: typeof value === "function" ? value(state.userInput) : value,
        }));
      },

      setOmnibarInput: (value) => {
        set((state) => ({
          omnibarInput:
            typeof value === "function" ? value(state.omnibarInput) : value,
        }));
      },

      setOmnibarModel: (model) => {
        set({ omnibarModel: model });
      },

      togglePanelLayout: () => {
        set((state) => ({
          panelLayout:
            state.panelLayout === "minimized" ? "expanded" : "minimized",
        }));
      },

      addAttachments: (attachments, removeIfPresent = false) => {
        const { attachedNodes } = get();
        // eslint-disable-next-line prefer-const
        let newAttachedNodes = [...attachedNodes];

        if (attachments.nodes) {
          for (const node of attachments.nodes) {
            const existingIndex = newAttachedNodes.findIndex(
              (n) => n.id === node.id,
            );
            if (removeIfPresent && existingIndex !== -1) {
              newAttachedNodes.splice(existingIndex, 1);
            } else if (existingIndex === -1) {
              newAttachedNodes.push(node);
            }
          }
        }

        set({
          attachedNodes: newAttachedNodes,
          ...(attachments.position !== undefined && {
            attachedPosition: attachments.position,
          }),
        });
      },

      removeAttachments: (attachments) => {
        let newAttachedNodes = [...get().attachedNodes];
        let newAttachedPosition = get().attachedPosition;

        for (const attachment of attachments) {
          if (attachment.type === "node" && attachment.ids) {
            newAttachedNodes = newAttachedNodes.filter(
              (node) => !attachment.ids!.includes(node.id),
            );
          } else if (attachment.type === "position") {
            newAttachedPosition = null;
          }
        }

        set({
          attachedNodes: newAttachedNodes,
          attachedPosition: newAttachedPosition,
        });
      },
      resetAttachments: () => {
        set({ attachedNodes: [], attachedPosition: null });
      },
    }),
    { name: "canvas-store" },
  ),
);

/**
 * Optimized hook to check if a node is attached.
 * Returns a stable boolean - only re-renders when the attachment status changes.
 */
export const useIsNodeAttached = (nodeId: string): boolean => {
  return useNoleStore(
    useShallow((state) => state.attachedNodes.some((n) => n.id === nodeId)),
  );
};

/**
 * Le composer a-t-il quelque chose à envoyer ?
 *
 * Sélecteur dérivé plutôt que lecture du texte : la valeur ne bascule qu'au
 * passage vide → non vide, donc le composer ne re-rend pas à chaque caractère
 * pour rafraîchir l'état de son bouton d'envoi. Seul `RichTextArea`, qui affiche
 * réellement le texte, s'abonne à `userInput`.
 */
export const useHasUserInput = (draft: NoleDraft = "panel"): boolean => {
  return useNoleStore(
    (state) => state[NOLE_DRAFT_FIELD[draft]].trim().length > 0,
  );
};

/** Le brouillon d'un composer, et son setter. */
export const useNoleDraft = (
  draft: NoleDraft,
): [string, Dispatch<SetStateAction<string>>] => {
  const value = useNoleStore((state) => state[NOLE_DRAFT_FIELD[draft]]);
  const setValue = useNoleStore((state) => state[NOLE_DRAFT_SETTER[draft]]);
  return [value, setValue];
};

export const useIsNolePanelExpanded = (): boolean => {
  return useNoleStore(useShallow((state) => state.panelLayout === "expanded"));
};
