import { memo, useCallback, useMemo, useRef, useState } from "react";
import { type Node } from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useNoWheelUnlessZoom } from "@/hooks/useNoWheelUnlessZoom";
import type { Id } from "@/../convex/_generated/dataModel";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import NodeFrame from "../NodeFrame";
import { Button } from "@/components/shadcn/button";
import { TbMaximize, TbNotes } from "react-icons/tb";
import { useWindowsStore } from "@/stores/windowsStore";
import {
  parseStoredBlockNoteDocument,
  type BlockNoteBlock,
} from "@/../convex/lib/blockNoteDocument";
import { BlockNoteStatic } from "@/components/blocknote/BlockNoteStatic";

// ── View-only rendering ──────────────────────────────────────────────────
// The canvas node renders the document via `BlockNoteStatic`, a read-only
// React renderer that walks the block tree and emits semantic HTML. Custom
// blocks/inline content (callout, date) render through their registry `View`
// directly in the live React tree — this fixes the previous bug where custom
// components did not show on the canvas (the old `blocksToFullHTML` path
// mounted/unmounted a temporary React root per block during render, which
// silently failed under React 19 + StrictMode). See
// src/components/blocknote/BlockNoteStatic.tsx and registry.tsx.

const EMPTY_PARAGRAPH_BLOCKS: BlockNoteBlock[] = [];

// ── Empty-content detection ──────────────────────────────────────────────
// BlockNote blocks have `content` (InlineContent[] with `text` fields) and
// `children` (nested blocks). We traverse both to decide if the doc is empty.
function hasBlockTextContent(blocks: unknown[]): boolean {
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as {
      content?: unknown;
      children?: unknown[];
    };

    const content = b.content;
    if (Array.isArray(content)) {
      for (const child of content) {
        if (!child || typeof child !== "object") continue;
        const c = child as { type?: unknown; text?: unknown; content?: unknown };
        // Date pills carry no text but are real content.
        if (c.type === "date") return true;
        if (typeof c.text === "string" && c.text.trim() !== "") {
          return true;
        }
        if (c.content && hasBlockTextContent([c.content])) return true;
      }
    } else if (typeof content === "string" && content.trim() !== "") {
      return true;
    }

    if (Array.isArray(b.children) && hasBlockTextContent(b.children)) {
      return true;
    }
  }
  return false;
}

function BlocknoteNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const values = useNodeDataValues(nodeDataId);

  const openWindow = useWindowsStore((s) => s.openWindow);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "blocknote" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const docString = values?.doc as string | undefined;

  const { blocks, isEmpty } = useMemo(() => {
    const parsed = parseStoredBlockNoteDocument(docString);
    if (!parsed || parsed.length === 0) {
      return { blocks: EMPTY_PARAGRAPH_BLOCKS, isEmpty: true };
    }
    const empty = !hasBlockTextContent(parsed);
    if (empty) {
      return { blocks: EMPTY_PARAGRAPH_BLOCKS, isEmpty: true };
    }
    return { blocks: parsed as BlockNoteBlock[], isEmpty: false };
  }, [docString]);

  const blocknoteTitle = useNodeDataTitle(nodeDataId) ?? "Blocknote";

  // ── Visibility-gated rendering ──────────────────────────────────────────
  // Same pattern as DocumentNode: IntersectionObserver with 300px rootMargin
  // + content-visibility:auto so off-screen nodes skip serialization+render.
  const [isVisible, setIsVisible] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Ref for the always-rendered container (non-title variant). The wheel hook
  // attaches its listener to this element so plain wheel scrolls the content
  // locally while Ctrl/Meta+wheel bubbles to React Flow for canvas zoom.
  const scrollRef = useRef<HTMLDivElement>(null);
  useNoWheelUnlessZoom(scrollRef);

  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    // Keep scrollRef in sync: callback refs fire during commit, before passive
    // effects, so the value is set before useNoWheelUnlessZoom's useEffect runs.
    scrollRef.current = el;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "300px" },
    );
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Button
          size="icon"
          variant="outline"
          disabled={!nodeDataId}
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </Button>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        {xyNode.data.variant !== "title" && (
          <div
            ref={setContainerRef}
            className="h-full [content-visibility:auto] [contain-intrinsic-size:auto_300px]"
          >
            {isVisible ? (
              <>
                {isEmpty ? (
                  <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40 select-none pointer-events-none">
                    <TbNotes size={22} />
                    <span className="text-xs">Double click to edit</span>
                  </div>
                ) : (
                  <BlockNoteStatic
                    blocks={blocks}
                    className="h-full min-h-0 overflow-y-auto p-4 select-none bn-readonly-container"
                  />
                )}
              </>
            ) : null}
          </div>
        )}
        {xyNode.data.variant === "title" && (
          <div className="flex items-center gap-2 px-2 min-w-0 h-full group/linknode relative">
            <TbNotes size={18} className="shrink-0" />
            <p className="truncate flex-1 min-w-0" title={blocknoteTitle}>
              {blocknoteTitle}
            </p>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(BlocknoteNode, areNodePropsEqual);
