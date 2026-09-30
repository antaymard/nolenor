/**
 * Where playback is, shared between a media element and whatever follows it
 * elsewhere in the tree (the video window's side panel).
 *
 * An external store rather than state: `timeupdate` fires several times a
 * second, and the window hosting the element must not re-render on each
 * tick. Readers subscribe through `useSyncExternalStore` with a derived
 * snapshot (the spoken line's index), so they only re-render when that
 * changes.
 */
export type PlaybackClock = {
  getTime: () => number;
  isPlaying: () => boolean;
  setTime: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createPlaybackClock(): PlaybackClock {
  let time = 0;
  let playing = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    getTime: () => time,
    isPlaying: () => playing,
    setTime: (seconds) => {
      if (seconds === time) return;
      time = seconds;
      notify();
    },
    setPlaying: (next) => {
      if (next === playing) return;
      playing = next;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Index of the last segment starting at or before `time`, -1 if none. */
export function findActiveIndex(
  segments: ReadonlyArray<{ s: number }>,
  time: number,
): number {
  let low = 0;
  let high = segments.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].s <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
