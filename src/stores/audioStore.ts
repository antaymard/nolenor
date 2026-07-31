import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface AudioStore {
  /**
   * The single audio node currently allowed to play. Starting playback on a
   * node claims this slot, which is how the other nodes know to pause: they
   * subscribe with a boolean selector and stop when it flips to false.
   */
  playingNodeId: string | null;
  /** Listener-side preference, deliberately not persisted to Convex. */
  volume: number;
  muted: boolean;

  requestPlay: (nodeId: string) => void;
  notifyStopped: (nodeId: string) => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
}

export const useAudioStore = create<AudioStore>()(
  devtools(
    (set, get) => ({
      playingNodeId: null,
      volume: 1,
      muted: false,

      requestPlay: (nodeId) => {
        if (get().playingNodeId === nodeId) return;
        set({ playingNodeId: nodeId });
      },

      // Only the node holding the slot may release it: a node pausing because
      // it just lost the slot must not clear the new owner.
      notifyStopped: (nodeId) => {
        if (get().playingNodeId !== nodeId) return;
        set({ playingNodeId: null });
      },

      setVolume: (volume) => {
        set({ volume: Math.min(1, Math.max(0, volume)) });
      },

      toggleMuted: () => {
        set((state) => ({ muted: !state.muted }));
      },
    }),
    { name: "audio-store" },
  ),
);
