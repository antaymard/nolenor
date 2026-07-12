import { memo, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { createSlateEditor, type Value } from "platejs";

import { BaseEditorKit } from "@/components/plate/editor-base-kit";
import { BasePreviewKit } from "@/components/plate/preview-base-kit";
import { EditorStatic } from "@/components/plate/editor-static";
import type { BaseFieldProps } from "@/types/ui";
import { cn } from "@/lib/utils";
import { useNoWheelUnlessZoom } from "@/hooks/useNoWheelUnlessZoom";

interface DocumentStaticFieldProps extends BaseFieldProps<{ doc: Value }> {
  allowDrag?: boolean;
  preview?: boolean;
}

const PREVIEW_VIRTUALIZE_THRESHOLD = 15;
const PREVIEW_OVERSCAN = 8;

function estimateBlockHeight(node: unknown): number {
  if (!node || typeof node !== "object") return 28;

  const block = node as { type?: unknown; children?: unknown[] };
  const type = typeof block.type === "string" ? block.type : "";

  if (type === "h1") return 56;
  if (type === "h2") return 48;
  if (type === "h3") return 40;
  if (type === "code_block") return 120;
  if (type === "blockquote") return 44;
  if (type === "ul" || type === "ol" || type === "table") return 84;
  if (type === "img" || type === "media_embed") return 180;

  const charCount: number = Array.isArray(block.children)
    ? block.children.reduce((count: number, child) => {
        if (!child || typeof child !== "object") return count;
        if (
          "text" in child &&
          typeof (child as { text?: unknown }).text === "string"
        ) {
          return count + (child as { text: string }).text.length;
        }
        return count;
      }, 0)
    : 0;

  const wrappedLines = Math.max(1, Math.ceil(charCount / 72));
  return Math.min(220, 26 + wrappedLines * 20);
}

function DocumentStaticField({
  value,
  allowDrag = false,
  preview = false,
}: DocumentStaticFieldProps) {
  // Vérifier que doc est bien un tableau valide pour Plate.js
  const isValidDoc = Array.isArray(value?.doc) && value.doc.length > 0;

  const plugins = preview ? BasePreviewKit : BaseEditorKit;
  const doc = value?.doc;
  const blocks = useMemo(() => doc ?? [], [doc]);
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldVirtualize =
    preview && isValidDoc && blocks.length > PREVIEW_VIRTUALIZE_THRESHOLD && !isExpanded;

  const containerRef = useRef<HTMLDivElement>(null);
  useNoWheelUnlessZoom(containerRef);

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? blocks.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => estimateBlockHeight(blocks[index]),
    overscan: PREVIEW_OVERSCAN,
  });

  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : [];
  const startIndex = virtualItems.length > 0 ? virtualItems[0].index : 0;
  const endIndex =
    virtualItems.length > 0
      ? virtualItems[virtualItems.length - 1].index + 1
      : Math.min(1, blocks.length);
  const topOffset = virtualItems.length > 0 ? virtualItems[0].start : 0;

  const editor = useMemo(
    () =>
      createSlateEditor({
        plugins,
        value: isValidDoc
          ? shouldVirtualize
            ? (blocks.slice(startIndex, endIndex) as Value)
            : value.doc
          : [{ type: "p", children: [{ text: "" }] }],
      }),
    [
      isValidDoc,
      shouldVirtualize,
      blocks,
      startIndex,
      endIndex,
      value?.doc,
      plugins,
    ],
  );

  if (!isValidDoc) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={preview && !isExpanded ? () => setIsExpanded(true) : undefined}
      className={cn(preview ? "h-full min-h-0 overflow-y-auto" : undefined)}
    >
      {shouldVirtualize ? (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          <div style={{ transform: `translateY(${topOffset}px)` }}>
            <EditorStatic
              editor={editor}
              className={cn(
                "p-4",
                allowDrag ? "select-none cursor-grab" : "nodrag",
              )}
            />
          </div>
        </div>
      ) : (
        <EditorStatic
          editor={editor}
          className={cn(
            "p-4",
            allowDrag ? "select-none cursor-grab" : "nodrag",
          )}
        />
      )}
    </div>
  );
}

export default memo(
  DocumentStaticField,
  (prev, next) =>
    prev.allowDrag === next.allowDrag &&
    prev.preview === next.preview &&
    prev.value?.doc === next.value?.doc,
);
