import { useEffect, useRef } from "react";

type UsePushToTalkOptions = {
  /** Start recording (speech-to-text) when the chord goes down. */
  onStart: () => void;
  /** Stop recording when the chord is released or the window blurs. */
  onStop: () => void;
};

/**
 * Desktop push-to-talk: hold Ctrl+Alt to record, release to stop.
 *
 * Tracks the set of currently-held keys so the recording starts once the chord
 * is complete and stops as soon as either key is released (or focus is lost).
 */
export function usePushToTalk({ onStart, onStop }: UsePushToTalkOptions) {
  const heldKeys = useRef<Set<string>>(new Set());
  const isActive = useRef(false);

  useEffect(() => {
    const isChordHeld = () =>
      heldKeys.current.has("Control") && heldKeys.current.has("Alt");

    const stop = () => {
      if (!isActive.current) return;
      isActive.current = false;
      onStop();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      heldKeys.current.add(e.key);
      if (isChordHeld() && !isActive.current) {
        isActive.current = true;
        onStart();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      heldKeys.current.delete(e.key);
      if (isActive.current && !isChordHeld()) stop();
    };
    const handleBlur = () => {
      heldKeys.current.clear();
      stop();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onStart, onStop]);
}
