"use client";

import * as React from "react";
import { getDeviceType } from "./useDeviceType";

/**
 * Helpers to detect a "touch-first tablet" used in portrait (e.g. a Boox Max
 * 13.3 held vertically). The goal is to adapt a few interactions for these
 * devices WITHOUT changing the desktop or phone experience:
 *  - desktops (incl. touchscreen laptops whose primary pointer is a mouse or
 *    trackpad) report `(pointer: fine)` and are therefore excluded;
 *  - phones are excluded from the "tablet" checks via the width floor below.
 */

const TABLET_MIN_WIDTH = 768;

function matchMediaSafe(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

/** Primary pointer is coarse (touch / stylus rather than a mouse). */
export function hasCoarsePointer(): boolean {
  return matchMediaSafe("(pointer: coarse)");
}

/**
 * A touch-first device that isn't a desktop. Uses the pointer capability with
 * a user-agent fallback so we still catch tablets even if pointer detection is
 * unreliable. Plain desktops (mouse/trackpad primary) are excluded.
 */
export function isTouchFirstDevice(): boolean {
  return hasCoarsePointer() || getDeviceType() !== "desktop";
}

/** Non-reactive read: touch-first device currently held in portrait. */
export function isTabletPortrait(): boolean {
  if (typeof window === "undefined") return false;
  return (
    matchMediaSafe("(orientation: portrait)") &&
    isTouchFirstDevice() &&
    window.innerWidth >= TABLET_MIN_WIDTH
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(() =>
    matchMediaSafe(query),
  );

  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Reactive: touch-first device (re-evaluates if the primary pointer changes). */
export function useIsTouchFirst(): boolean {
  const coarse = useMediaQuery("(pointer: coarse)");
  return coarse || getDeviceType() !== "desktop";
}

/** Reactive: touch-first device held in portrait (reacts to rotation). */
export function useIsTabletPortrait(): boolean {
  const portrait = useMediaQuery("(orientation: portrait)");
  const wide = useMediaQuery(`(min-width: ${TABLET_MIN_WIDTH}px)`);
  const touchFirst = useIsTouchFirst();
  return portrait && wide && touchFirst;
}
