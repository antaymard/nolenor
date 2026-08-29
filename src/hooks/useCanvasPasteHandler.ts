import { useEffect, useCallback, useRef } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasContentIngest } from "./useCanvasContentIngest";
import { useViewportCenter } from "./useViewportCenter";

const PASTE_GUARD_WINDOW_MS = 300;

type PasteGuardState = {
  inFlight: boolean;
  lastSignature: string;
  lastAt: number;
};

function runWithPasteGuard(
  guardState: PasteGuardState,
  signature: string,
  action: () => Promise<void>,
): boolean {
  const now = Date.now();
  const inGuardWindow = now - guardState.lastAt < PASTE_GUARD_WINDOW_MS;

  if (
    (guardState.inFlight && inGuardWindow) ||
    (guardState.lastSignature === signature && inGuardWindow)
  ) {
    return false;
  }

  guardState.inFlight = true;
  guardState.lastSignature = signature;
  guardState.lastAt = now;

  void (async () => {
    try {
      await action();
    } finally {
      guardState.inFlight = false;
      guardState.lastAt = Date.now();
    }
  })();

  return true;
}

/**
 * Hook to handle paste events on the canvas
 * - Detects files (image, audio, PDF, CSV, markdown) and creates the matching node
 * - Detects URLs and creates ImageNode (if image URL) or LinkNode (if web URL)
 * - Falls back to a BlocknoteNode for plain text
 *
 * Le mapping « contenu → node » vit dans `useCanvasContentIngest`, partagé avec
 * le glisser-déposer. Ici on ne garde que ce qui est propre au coller : la
 * position (centre du viewport, il n'y a pas de curseur), la garde anti-doublon
 * et le filtre de focus.
 */
export function useCanvasPasteHandler() {
  const getViewportCenter = useViewportCenter();
  const { createNodesFromFiles, createNodeFromText } = useCanvasContentIngest();
  const focus = useCanvasStore((s) => s.focus);
  const pasteGuardRef = useRef<PasteGuardState>({
    inFlight: false,
    lastSignature: "",
    lastAt: 0,
  });

  /**
   * Main paste event handler
   */
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      // Only paste onto the canvas when the canvas is what has focus. Tested
      // positively (`!== "canvas"`) and not against a list of other values:
      // with the old `=== "richtext-editor"` check, any new Focus value fell
      // through to canvas behaviour — a paste over an open modal created a
      // node behind it.
      if (focus !== "canvas") {
        return;
      }
      // Ignore paste events in input/textarea/contenteditable elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Check for files first
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) {
        const signature = files
          .map((f) => `${f.type}:${f.size}:${f.lastModified}`)
          .join("|");
        e.preventDefault();
        runWithPasteGuard(pasteGuardRef.current, signature, async () => {
          await createNodesFromFiles(files, getViewportCenter());
        });
        return;
      }

      // Check for text (URL or plain text)
      const text = e.clipboardData?.getData("text");
      if (text && text.trim()) {
        const trimmedText = text.trim();
        const signature = `text:${trimmedText.slice(0, 500)}`;
        e.preventDefault();

        runWithPasteGuard(pasteGuardRef.current, signature, async () => {
          await createNodeFromText(trimmedText, getViewportCenter());
        });
      }
    },
    [focus, createNodesFromFiles, createNodeFromText, getViewportCenter],
  );

  // Register paste event listener
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);
}
