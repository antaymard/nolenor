import { memo, useCallback, useMemo, useRef } from "react";
import type { PartialBlock } from "@blocknote/core";
import toast from "react-hot-toast";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useNoWheelUnlessZoom } from "@/hooks/useNoWheelUnlessZoom";
import { useCanvasScrollArea } from "@/hooks/useCanvasScrollArea";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import { downloadBlob } from "@/lib/downloadFile";
import NodeFrame from "../NodeFrame";
import { TbDownload, TbMaximize, TbNotes } from "react-icons/tb";
import { useWindowsStore } from "@/stores/windowsStore";
import {
  blockNoteDocumentHasText,
  parseStoredBlockNoteDocument,
  type BlockNoteBlock,
} from "@/../convex/lib/blockNoteDocument";
import { blockNoteBlocksToMarkdown } from "@/lib/blockNoteMarkdownConverter";
import { filenameSlug } from "@/lib/filenameSlug";
import { BlockNoteStatic } from "@/components/blocknote/BlockNoteStatic";
import { BlockNoteErrorBoundary } from "@/components/blocknote/BlockNoteErrorBoundary";
import NodeEmptyState from "../NodeEmptyState";
import type { XyNodeProps } from "@/types/domain";

// ── View-only rendering ──────────────────────────────────────────────────
// The canvas node renders the document via `BlockNoteStatic`, a read-only
// React renderer that walks the block tree and emits semantic HTML. Custom
// blocks/inline content (callout, date) render through their registry `View`
// directly in the live React tree — this fixes the previous bug where custom
// components did not show on the canvas (the old `blocksToFullHTML` path
// mounted/unmounted a temporary React root per block during render, which
// silently failed under React 19 + StrictMode). See
// src/components/blocknote/BlockNoteStatic.tsx and registry.tsx.

// Empty-content detection lives in the shared document layer
// (`blockNoteDocumentHasText`), so the canvas, the node title and the agent
// tools all agree on what "empty" means.
const NO_BLOCKS: BlockNoteBlock[] = [];

function markdownFilename(title: string): string {
  return `${filenameSlug(title, "blocknote")}.md`;
}

function BlocknoteNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);

  const openWindow = useWindowsStore((s) => s.openWindow);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "blocknote" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const docString = values?.doc as string | undefined;

  const { blocks, isEmpty } = useMemo(() => {
    const parsed = parseStoredBlockNoteDocument(docString);
    if (!parsed || !blockNoteDocumentHasText(parsed)) {
      return { blocks: NO_BLOCKS, isEmpty: true };
    }
    return { blocks: parsed, isEmpty: false };
  }, [docString]);

  const blocknoteTitle = useNodeDataTitle(nodeDataId) ?? "Blocknote";

  const handleDownload = useCallback(() => {
    const result = blockNoteBlocksToMarkdown(
      blocks as unknown as PartialBlock[],
    );
    if (result.status !== "ok") {
      toast.error("Impossible de convertir ce document en Markdown");
      return;
    }

    downloadBlob(
      new Blob([result.markdown], { type: "text/markdown;charset=utf-8" }),
      markdownFilename(blocknoteTitle),
    );
  }, [blocknoteTitle, blocks]);

  // Toujours monté, jamais démonté hors écran. Un IntersectionObserver
  // (marge 300px) démontait le contenu des nodes sortis de l'écran : au pan,
  // chaque document qui rentrait remontait tout son arbre de blocs EN PLEIN
  // GESTE — des montages React au milieu des frames du pan, et le scroll
  // interne du document perdu au passage. Le coût d'affichage hors écran est
  // déjà borné par `content-visibility: auto` sur le conteneur ci-dessous (et
  // sur celui de NodeFrame) : le navigateur y saute layout et paint, sans que
  // React n'ait rien à démonter.
  //
  // Ref du conteneur (variante non-titre) : le hook de molette y pose son
  // listener, pour qu'une molette simple fasse défiler le contenu localement
  // pendant que Ctrl/Meta+molette remonte jusqu'à React Flow pour le zoom.
  const scrollRef = useRef<HTMLDivElement>(null);
  useNoWheelUnlessZoom(scrollRef);

  // La zone qui défile vraiment : la racine de BlockNoteStatic, qui ne défile
  // qu'au survol du node (cf. `useCanvasScrollArea`).
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useCanvasScrollArea(scrollAreaRef);

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <NodeToolbarButton
          label="Open"
          disabled={!nodeDataId}
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </NodeToolbarButton>
        {!isEmpty && (
          <NodeToolbarButton
            label="Download"
            title="Download as Markdown"
            onClick={handleDownload}
          >
            <TbDownload />
          </NodeToolbarButton>
        )}
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        {xyNode.data.variant !== "title" && (
          <div
            ref={scrollRef}
            // `overscroll-x-none` : le swipe trackpad horizontal qui naît ici
            // ne doit pas chaîner jusqu'au geste "back" navigateur — le scroll
            // vertical interne reste inchangé.
            className="h-full overscroll-x-none [content-visibility:auto] [contain-intrinsic-size:auto_300px]"
          >
            {isEmpty ? (
              <NodeEmptyState
                icon={<TbNotes size={22} />}
                action="double-click"
              />
            ) : (
              <BlockNoteErrorBoundary resetKey={docString}>
                <BlockNoteStatic
                  ref={scrollAreaRef}
                  blocks={blocks}
                  className="canvas-scroll-area h-full min-h-0 overflow-y-auto overscroll-x-none p-4 select-none bn-readonly-container"
                />
              </BlockNoteErrorBoundary>
            )}
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
