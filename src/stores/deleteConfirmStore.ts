import { create } from "zustand";

/**
 * La confirmation avant de supprimer du contenu qu'on ne voit pas : celui des
 * frames compactes, qui part avec elles (cf. `useDeleteCanvasElements`).
 *
 * Un store et une promesse plutôt qu'un état local : la suppression part de
 * plusieurs endroits (clavier, menus, toolbar mobile), qui passent tous par le
 * même hook, et c'est lui qui attend la réponse. La modale, montée une fois
 * avec le canvas, ne fait que la donner.
 */
type PendingConfirmation = {
  hiddenNodeCount: number;
  resolve: (confirmed: boolean) => void;
};

interface DeleteConfirmStore {
  pending: PendingConfirmation | null;
  /** Une demande déjà en attente est refusée : un seul geste à la fois. */
  requestConfirmation: (hiddenNodeCount: number) => Promise<boolean>;
  answer: (confirmed: boolean) => void;
}

export const useDeleteConfirmStore = create<DeleteConfirmStore>()(
  (set, get) => ({
    pending: null,
    requestConfirmation: (hiddenNodeCount) => {
      get().pending?.resolve(false);
      return new Promise<boolean>((resolve) => {
        set({ pending: { hiddenNodeCount, resolve } });
      });
    },
    answer: (confirmed) => {
      const { pending } = get();
      if (!pending) return;
      set({ pending: null });
      pending.resolve(confirmed);
    },
  }),
);
