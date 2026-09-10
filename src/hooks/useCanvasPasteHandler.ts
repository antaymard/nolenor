import { useEffect, useCallback, useRef } from "react";
import { useCanvasStore } from "@/stores/canvasStore";
import { useNodeClipboardStore } from "@/stores/nodeClipboardStore";
import { useCanvasContentIngest } from "./useCanvasContentIngest";
import { useCanvasPointerPosition } from "./useCanvasPointerPosition";
import { usePasteNodes } from "./usePasteNodes";

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
 * - Falls back to the internal node clipboard (Ctrl+C on the canvas) when the
 *   system clipboard carries nothing pastable
 *
 * Le mapping « contenu → node » vit dans `useCanvasContentIngest`, partagé avec
 * le glisser-déposer. Ici on ne garde que ce qui est propre au coller : la
 * position (curseur suivi, repli centre du viewport si inconnue/hors pane),
 * la garde anti-doublon et le filtre de focus.
 *
 * Le coller de nodes passe par l'événement `paste` — pas par un keydown
 * Ctrl+V — pour une raison de précédence : quand le clipboard système contient
 * des fichiers ou du texte, c'est le contenu externe qui gagne ; les nodes
 * copiés ne sont qu'un repli quand il n'y a rien d'autre à coller.
 */
export function useCanvasPasteHandler({ canEdit }: { canEdit: boolean }) {
  const { getPointerFlowPosition } = useCanvasPointerPosition();
  const { createNodesFromFiles, createNodeFromText } = useCanvasContentIngest();
  const { pasteNodesAt } = usePasteNodes();
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
          await createNodesFromFiles(files, getPointerFlowPosition());
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
          await createNodeFromText(trimmedText, getPointerFlowPosition());
        });
        return;
      }

      // Fallback : nodes copiés via Ctrl+C sur le canvas. Dernier de la file —
      // le clipboard système vide signifie qu'il n'y a rien d'externe à
      // coller. Même positionnement qu'une création au curseur : le coin
      // supérieur-gauche du groupe est posé au pointeur.
      const { items, seq } = useNodeClipboardStore.getState();
      if (canEdit && items.length > 0) {
        e.preventDefault();

        runWithPasteGuard(pasteGuardRef.current, `nodes:${seq}`, async () => {
          await pasteNodesAt(getPointerFlowPosition());
        });
      }
    },
    [
      focus,
      canEdit,
      createNodesFromFiles,
      createNodeFromText,
      pasteNodesAt,
      getPointerFlowPosition,
    ],
  );

  // Register paste event listener
  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [handlePaste]);
}
