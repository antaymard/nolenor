import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Le node qui doit passer en édition dès son montage.
 *
 * Créer un node depuis le menu « Add a block » ou un raccourci doit poser le
 * curseur dedans : le node n'existe pas encore au moment du clic, donc le
 * signal transite par ici plutôt que par `node.data` — `data` est persisté
 * (cf. `canvasNodesValidator`), un drapeau y rouvrirait le mode édition à
 * chaque rechargement et pour tous les collaborateurs.
 *
 * Le pendant de `edgeEditorStore` pour les nodes. Le node concerné consomme
 * l'id (le remet à `null`) : le signal ne vaut que pour un montage.
 */
interface NodeEditorStore {
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;
}

export const useNodeEditorStore = create<NodeEditorStore>()(
  devtools((set) => ({
    editingNodeId: null,
    setEditingNodeId: (id) => set({ editingNodeId: id }),
  })),
);
