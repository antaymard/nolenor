import { create } from "zustand";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasOp } from "@/../convex/schemas/canvasOpsSchema";

/**
 * La pile d'annulation du canvas.
 *
 * Elle vit dans l'onglet, en mémoire, et n'est jamais partagée : c'est ce qui
 * lui donne sa propriété la plus importante — on n'y pousse que ce qu'on
 * exécute soi-même. Ni les écritures de Nolë, ni celles d'un collaborateur sur
 * un canvas partagé n'y entrent, sans qu'aucun filtre n'ait à le garantir. La
 * contrepartie est assumée : un rechargement vide la pile.
 *
 * Conséquence à garder en tête : si l'agent ou quelqu'un d'autre a bougé un
 * node entre votre geste et votre Ctrl+Z, VOTRE annulation gagne — elle
 * rétablit ce que vous aviez, elle ne fusionne pas. C'est ce qu'une pile
 * locale peut promettre honnêtement.
 */

export interface HistoryEntry {
  id: string;
  label: string;
  /** Opérations qui défont le geste, dans l'ordre d'application. */
  undo: CanvasOp[];
  /** Opérations qui le refont. */
  redo: CanvasOp[];
}

interface Draft {
  label: string;
  undo: CanvasOp[];
  redo: CanvasOp[];
}

/**
 * Priorité d'application. Une edge ne peut pas vivre si une extrémité est à la
 * corbeille : on remet donc les nodes avant les edges, et on retire les edges
 * avant les nodes. Tri stable — l'ordre relatif à l'intérieur d'un même verbe
 * est préservé.
 */
const OP_RANK: Record<CanvasOp["kind"], number> = {
  untrashNodes: 0,
  patchNodes: 1,
  untrashEdges: 2,
  patchEdges: 3,
  trashEdges: 4,
  trashNodes: 5,
};

/**
 * Trie et fusionne les opérations d'une entrée : un seul aller-retour, une
 * seule transaction serveur, et des dépendances respectées.
 *
 * La fusion concatène les charges utiles de même verbe. Pour les `patch*`,
 * l'ordre compte : le serveur applique les updates dans l'ordre du tableau,
 * donc la DERNIÈRE l'emporte pour un même id. C'est voulu côté undo, où les
 * inverses sont empilés en tête (cf. `record`) : le premier inverse enregistré
 * — celui qui porte la vraie valeur d'avant le geste — se retrouve en queue,
 * donc gagne.
 */
export function orderOps(ops: CanvasOp[]): CanvasOp[] {
  const sorted = [...ops].sort((a, b) => OP_RANK[a.kind] - OP_RANK[b.kind]);

  const merged: CanvasOp[] = [];
  for (const op of sorted) {
    const previous = merged[merged.length - 1];
    if (previous?.kind !== op.kind) {
      merged.push(structuredClone(op));
      continue;
    }
    switch (op.kind) {
      case "patchNodes":
        (previous as typeof op).updates.push(...op.updates);
        break;
      case "patchEdges":
        (previous as typeof op).updates.push(...op.updates);
        break;
      case "trashNodes":
      case "untrashNodes":
        (previous as typeof op).nodeIds.push(...op.nodeIds);
        break;
      case "trashEdges":
      case "untrashEdges":
        (previous as typeof op).edgeIds.push(...op.edgeIds);
        break;
    }
  }
  return merged;
}

const MAX_ENTRIES = 50;

let entryCounter = 0;

interface CanvasHistoryStore {
  canvasId: Id<"canvases"> | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /**
   * Profondeur de transaction. Un geste = une entrée, même quand il se
   * disperse : supprimer un node produit des changements de nodes ET d'edges,
   * un drag multi-sélection produit N changements de position.
   */
  depth: number;
  draft: Draft | null;
  /** Une annulation en vol : Ctrl+Z maintenu ne doit pas s'entrelacer. */
  isApplying: boolean;

  setCanvasId: (canvasId: Id<"canvases">) => void;
  reset: () => void;

  begin: (label: string) => void;
  /**
   * Enregistre l'inverse d'une écriture et de quoi la refaire. Hors
   * transaction ouverte, une transaction implicite est ouverte et refermée à
   * la microtâche suivante — filet de sécurité pour les écritures isolées, pas
   * un remplacement de `begin`/`end` pour un geste qu'on sait multiple.
   */
  record: (undo: CanvasOp, redo: CanvasOp) => void;
  end: () => void;

  setApplying: (isApplying: boolean) => void;
  /** Dépile pour annuler. L'entrée n'est rejouée côté `future` qu'en cas de succès. */
  popUndo: () => HistoryEntry | undefined;
  popRedo: () => HistoryEntry | undefined;
  pushUndone: (entry: HistoryEntry) => void;
  pushRedone: (entry: HistoryEntry) => void;
}

export const useCanvasHistoryStore = create<CanvasHistoryStore>()(
  (set, get) => ({
    canvasId: null,
    past: [],
    future: [],
    depth: 0,
    draft: null,
    isApplying: false,

    setCanvasId: (canvasId) => {
      if (get().canvasId === canvasId) return;
      set({
        canvasId,
        past: [],
        future: [],
        depth: 0,
        draft: null,
        isApplying: false,
      });
    },

    reset: () => {
      set({
        past: [],
        future: [],
        depth: 0,
        draft: null,
        isApplying: false,
      });
    },

    begin: (label) => {
      set((state) => ({
        depth: state.depth + 1,
        draft: state.draft ?? { label, undo: [], redo: [] },
      }));
    },

    record: (undo, redo) => {
      const { depth, draft } = get();

      if (depth === 0 && draft === null) {
        set({ draft: { label: "", undo: [undo], redo: [redo] } });
        queueMicrotask(() => {
          // Une transaction explicite ouverte entre-temps reprend la main :
          // c'est elle qui fermera le brouillon.
          if (get().depth > 0) return;
          get().end();
        });
        return;
      }

      set((state) =>
        state.draft === null
          ? state
          : {
              draft: {
                ...state.draft,
                // Les inverses s'empilent en tête : annuler un geste, c'est
                // défaire ses écritures dans l'ordre inverse.
                undo: [undo, ...state.draft.undo],
                redo: [...state.draft.redo, redo],
              },
            },
      );
    },

    end: () => {
      set((state) => {
        const depth = Math.max(0, state.depth - 1);
        if (depth > 0) return { depth };
        const draft = state.draft;
        if (!draft || draft.undo.length === 0) {
          return { depth, draft: null };
        }
        entryCounter += 1;
        const entry: HistoryEntry = {
          id: `h${entryCounter}`,
          label: draft.label,
          undo: orderOps(draft.undo),
          redo: orderOps(draft.redo),
        };
        return {
          depth,
          draft: null,
          past: [...state.past, entry].slice(-MAX_ENTRIES),
          // Un nouveau geste coupe la branche de redo — sémantique d'un
          // historique linéaire.
          future: [],
        };
      });
    },

    setApplying: (isApplying) => {
      set({ isApplying });
    },

    popUndo: () => {
      const entry = get().past[get().past.length - 1];
      if (!entry) return undefined;
      set((state) => ({ past: state.past.slice(0, -1) }));
      return entry;
    },

    popRedo: () => {
      const entry = get().future[get().future.length - 1];
      if (!entry) return undefined;
      set((state) => ({ future: state.future.slice(0, -1) }));
      return entry;
    },

    pushUndone: (entry) => {
      set((state) => ({ future: [...state.future, entry] }));
    },

    pushRedone: (entry) => {
      set((state) => ({ past: [...state.past, entry].slice(-MAX_ENTRIES) }));
    },
  }),
);

/**
 * Exécute `fn` comme un seul geste annulable. À préférer partout où un geste
 * enchaîne plusieurs écritures (coller N nodes, changer une variante qui
 * redimensionne aussi) — la transaction implicite de `record` ne couvre qu'un
 * même tick.
 */
export async function withUndoTransaction<T>(
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const store = useCanvasHistoryStore.getState();
  store.begin(label);
  try {
    return await fn();
  } finally {
    useCanvasHistoryStore.getState().end();
  }
}

/** Enregistre l'inverse d'une écriture. Raccourci hors composant React. */
export function recordUndo(undo: CanvasOp, redo: CanvasOp): void {
  useCanvasHistoryStore.getState().record(undo, redo);
}
