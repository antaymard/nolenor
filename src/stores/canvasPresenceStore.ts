import { create } from "zustand";
import type { PresenceState } from "@convex-dev/presence/react";
import { parsePresenceUserId } from "@/../convex/lib/presenceIds";
import { readSelectedNodeIds } from "@/../convex/lib/presenceData";

/**
 * Les AUTRES membres présents sur le canvas ouvert, et ce qu'ils sélectionnent.
 *
 * Un store et pas une lecture directe de la query de présence depuis
 * `NodeFrame` : rendu une fois par node, il re-rendrait TOUS les nodes à
 * chaque mise à jour de la room (un clic de sélection chez quelqu'un). Ici
 * chaque node s'abonne à sa seule entrée, à référence stable tant qu'elle ne
 * change pas.
 *
 * Alimenté en un point unique (`CanvasPresenceSync`, monté par `CanvasFlow`)
 * et vidé au démontage de celui-ci.
 */

export type Collaborator = {
  /** Id `users` (pas l'id de présence, qui est par onglet). */
  userId: string;
  name?: string;
  image?: string;
};

interface CanvasPresenceStore {
  collaborators: Collaborator[];
  /** nodeId → membres qui l'ont sélectionné, dans l'ordre des collaborateurs. */
  selectionsByNodeId: Map<string, Collaborator[]>;
  setPresence: (states: PresenceState[], myUserId: string) => void;
  reset: () => void;
}

const EMPTY_SELECTIONS = new Map<string, Collaborator[]>();

function sameCollaborators(a: Collaborator[], b: Collaborator[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (c, i) =>
        c.userId === b[i].userId &&
        c.name === b[i].name &&
        c.image === b[i].image,
    )
  );
}

export const useCanvasPresenceStore = create<CanvasPresenceStore>()((set) => ({
  collaborators: [],
  selectionsByNodeId: EMPTY_SELECTIONS,

  setPresence: (states, myUserId) =>
    set((state) => {
      // Un participant par onglet côté serveur : on regroupe par utilisateur
      // réel, et sa sélection est l'union de celles de ses onglets.
      const byUser = new Map<string, Collaborator>();
      const selectedByUser = new Map<string, Set<string>>();
      for (const presence of states) {
        if (!presence.online) continue;
        const userId = parsePresenceUserId(presence.userId);
        if (!userId || userId === myUserId) continue;
        if (!byUser.has(userId)) {
          byUser.set(userId, {
            userId,
            name: presence.name,
            image: presence.image,
          });
          selectedByUser.set(userId, new Set());
        }
        for (const nodeId of readSelectedNodeIds(presence.data)) {
          selectedByUser.get(userId)?.add(nodeId);
        }
      }

      const nextCollaborators = [...byUser.values()];
      const collaborators = sameCollaborators(
        state.collaborators,
        nextCollaborators,
      )
        ? state.collaborators
        : nextCollaborators;

      const nextSelections = new Map<string, Collaborator[]>();
      for (const collaborator of collaborators) {
        for (const nodeId of selectedByUser.get(collaborator.userId) ?? []) {
          const list = nextSelections.get(nodeId);
          if (list) list.push(collaborator);
          else nextSelections.set(nodeId, [collaborator]);
        }
      }
      // Partage structurel : un node dont l'entrée n'a pas changé garde la
      // même référence, et ne re-rend pas.
      let selectionsChanged =
        nextSelections.size !== state.selectionsByNodeId.size;
      for (const [nodeId, list] of nextSelections) {
        const previous = state.selectionsByNodeId.get(nodeId);
        if (previous && sameCollaborators(previous, list)) {
          nextSelections.set(nodeId, previous);
        } else {
          selectionsChanged = true;
        }
      }

      if (collaborators === state.collaborators && !selectionsChanged) {
        return state;
      }
      return {
        collaborators,
        selectionsByNodeId: selectionsChanged
          ? nextSelections
          : state.selectionsByNodeId,
      };
    }),

  reset: () =>
    set({ collaborators: [], selectionsByNodeId: EMPTY_SELECTIONS }),
}));

/** Les membres qui ont sélectionné CE node, `undefined` s'il n'y en a pas. */
export function useNodeRemoteSelection(
  nodeId: string,
): Collaborator[] | undefined {
  return useCanvasPresenceStore((state) =>
    state.selectionsByNodeId.get(nodeId),
  );
}

/**
 * Teinte stable par utilisateur : la même personne garde sa couleur dans la
 * facepile et sur les nodes qu'elle sélectionne.
 */
export function collaboratorHue(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function collaboratorColor(userId: string): string {
  return `hsl(${collaboratorHue(userId)} 55% 45%)`;
}

export function collaboratorLabel(collaborator: Collaborator): string {
  return collaborator.name ?? "Someone";
}
