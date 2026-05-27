import { memo, useCallback, useEffect, useRef, useState } from "react";
import { type Node } from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import type { Id } from "@/../convex/_generated/dataModel";
import { normalizeNodeId, type Value } from "platejs";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import NodeFrame from "../NodeFrame";
import DocumentStaticField from "@/components/fields/document-fields/DocumentStaticField";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { TbMaximize, TbNews } from "react-icons/tb";
import { useWindowsStore } from "@/stores/windowsStore";
import { parseStoredPlateDocument } from "@/../convex/lib/plateDocumentStorage";
import { PlateErrorBoundary } from "@/components/plate/PlateErrorBoundary";

function hasTextContent(nodes: unknown[]): boolean {
  for (const node of nodes) {
    if (node && typeof node === "object") {
      if (
        "text" in node &&
        typeof (node as { text: unknown }).text === "string" &&
        (node as { text: string }).text.trim() !== ""
      ) {
        return true;
      }
      if (
        "children" in node &&
        Array.isArray((node as { children: unknown }).children) &&
        hasTextContent((node as { children: unknown[] }).children)
      ) {
        return true;
      }
    }
  }
  return false;
}

function DocumentNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const values = useNodeDataValues(nodeDataId);
  const [previewValue, setPreviewValue] = useState<Value | null>(null);
  const [isDocEmpty, setIsDocEmpty] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const openWindow = useWindowsStore((s) => s.openWindow);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "document" });
  }, [nodeDataId, openWindow, xyNode.id]);

  // Render full static preview directly (all-or-nothing, no sequential queue).
  useEffect(() => {
    setIsPreviewLoading(true);
    const parsedDoc = parseStoredPlateDocument(values?.doc);
    if (!parsedDoc || !Array.isArray(parsedDoc) || parsedDoc.length === 0) {
      setPreviewValue(null);
      setIsDocEmpty(true);
      setIsPreviewLoading(false);
      return;
    }
    const normalized = normalizeNodeId(parsedDoc as Value);
    const empty = !hasTextContent(normalized);
    setIsDocEmpty(empty);
    if (empty) {
      setPreviewValue(null);
      setIsPreviewLoading(false);
      return;
    }
    setPreviewValue(normalized);
    setIsPreviewLoading(false);
  }, [values?.doc]);

  const documentTitle = useNodeDataTitle(nodeDataId) ?? "Document";

  const [isVisible, setIsVisible] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Callback ref so the observer is (re)attached every time the container
  // mounts. Using a useRef + useEffect([], ...) leaves the observer bound to a
  // detached element when the variant toggles to "title" and back, which left
  // isVisible stuck on false and rendered a blank node.
  const setContainerRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
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
                {isDocEmpty ? (
                  <div className="h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground/40 select-none pointer-events-none">
                    <TbNews size={22} />
                    <span className="text-xs">Double click to edit</span>
                  </div>
                ) : isPreviewLoading ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground/50 select-none pointer-events-none">
                    <Spinner className="size-4" />
                    <span className="text-xs">Loading preview...</span>
                  </div>
                ) : previewValue ? (
                  <div className="relative h-full min-h-0">
                    <PlateErrorBoundary resetKey={values?.doc}>
                      <DocumentStaticField
                        value={{ doc: previewValue }}
                        allowDrag={!xyNode.selected}
                        preview
                      />
                    </PlateErrorBoundary>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )}
        {xyNode.data.variant === "title" && (
          <div className="flex items-center gap-2 px-2 min-w-0 h-full group/linknode relative">
            <TbNews size={18} className="shrink-0" />
            <p className="truncate flex-1 min-w-0" title={documentTitle}>
              {documentTitle}
            </p>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(DocumentNode, areNodePropsEqual);
