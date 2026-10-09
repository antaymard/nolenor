import { create } from "zustand";

/**
 * « Aller à un node » caché dans une frame compacte.
 *
 * Sur le canvas, le node est masqué (cf. `frameVariant`) : impossible de
 * cadrer dessus. `useGoToNode` ouvre alors la window de la frame et dépose ici
 * le node à viser ; la window (`FrameWindow`) cadre dessus une fois ses nodes
 * mesurés, puis consomme la demande.
 */
interface FrameWindowFocusRequest {
  frameId: string;
  nodeId: string;
}

interface FrameWindowFocusStore {
  request: FrameWindowFocusRequest | null;
  requestFocus: (request: FrameWindowFocusRequest) => void;
  /** Retire la demande, si c'est toujours celle-là. */
  consume: (request: FrameWindowFocusRequest) => void;
}

export const useFrameWindowFocusStore = create<FrameWindowFocusStore>()(
  (set) => ({
    request: null,
    // Un objet neuf à chaque demande : viser deux fois le même node relance
    // le cadrage.
    requestFocus: (request) => set({ request: { ...request } }),
    consume: (request) =>
      set((state) => (state.request === request ? { request: null } : state)),
  }),
);
