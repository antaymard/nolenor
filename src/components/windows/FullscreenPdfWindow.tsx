import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery } from "convex/react";
import { List } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { cn } from "@/lib/utils";
import { type OpenedWindow } from "@/stores/windowsStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useDebounce } from "@/hooks/use-debounce";
import { useIsTabletPortrait } from "@/hooks/useTabletMode";
import type { FileFieldType } from "@/components/fields/file-fields/FileNameField";
import { api } from "@/../convex/_generated/api";
import ChatContainer from "@/components/canvas/nole-panel/ChatContainer";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import FullscreenWindowFrame from "./FullscreenWindowFrame";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface FullscreenPdfWindowProps {
  openedWindow: OpenedWindow;
}

type OutlineEntry = {
  pageIndex: number;
  level: number;
  title: string;
};

const LEVEL_RE = /^h([1-6])$/;

export default function FullscreenPdfWindow({
  openedWindow,
}: FullscreenPdfWindowProps) {
  const { nodeDataId } = openedWindow;
  const canvasId = useCanvasStore((s) => s.canvas?._id);

  const nodeDataValues = useNodeDataValues(nodeDataId);
  const files = (nodeDataValues?.files as FileFieldType[] | undefined) ?? [];
  const pdfUrl = files.length > 0 ? files[0].url : "";

  const pdfPages = useQuery(
    api.searchableChunks.listPdfPages,
    canvasId ? { nodeDataId, canvasId } : "skip",
  );

  const [isChatOpen, setIsChatOpen] = useState(false);
  useHotkey("N", () => setIsChatOpen((v) => !v));

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [pageWidth, setPageWidth] = useState<number | undefined>(undefined);
  const [numPages, setNumPages] = useState<number>(0);
  const debouncedWidth = useDebounce(pageWidth, 150);

  useEffect(() => {
    const container = pageContainerRef.current;
    if (!container) return;

    const measure = () => {
      const available = container.clientWidth;
      const target = Math.min(available, 960);
      setPageWidth(Math.max(320, target));
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    measure();

    return () => resizeObserver.disconnect();
  }, []);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
    },
    [],
  );

  const outline = useMemo<OutlineEntry[]>(() => {
    if (!pdfPages) return [];
    const entries: OutlineEntry[] = [];
    for (const page of pdfPages) {
      const pageIndex =
        typeof page.page === "number" ? page.page - 1 : page.order;
      for (const section of page.sections) {
        const match = LEVEL_RE.exec(section.level);
        if (!match) continue;
        const title = section.title.trim();
        if (!title) continue;
        entries.push({
          pageIndex,
          level: parseInt(match[1], 10),
          title,
        });
      }
    }
    return entries;
  }, [pdfPages]);

  const fallbackOutline = useMemo<OutlineEntry[]>(() => {
    if (numPages <= 0) return [];
    return Array.from({ length: numPages }, (_, i) => ({
      pageIndex: i,
      level: 1,
      title: `Page ${i + 1}`,
    }));
  }, [numPages]);

  const displayedOutline = outline.length > 0 ? outline : fallbackOutline;

  const scrollToPage = useCallback((pageIndex: number) => {
    const target = pageRefs.current[pageIndex];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // On portrait tablets, drop the chat + outline side columns for a focused,
  // full-width reading mode. The outline moves into a header dropdown.
  const isTabletPortrait = useIsTabletPortrait();
  const [outlineOpen, setOutlineOpen] = useState(false);

  const handleOutlineSelect = useCallback(
    (pageIndex: number) => {
      scrollToPage(pageIndex);
      setOutlineOpen(false);
    },
    [scrollToPage],
  );

  return (
    <FullscreenWindowFrame
      openedWindow={openedWindow}
      headerLeftSlot={
        isTabletPortrait ? (
          <Popover open={outlineOpen} onOpenChange={setOutlineOpen}>
            <PopoverTrigger asChild>
              <button
                data-window-control="true"
                className="shrink-0 rounded p-1 opacity-60 hover:bg-(--brand)/15 hover:text-(--brand) hover:opacity-100"
                aria-label="Outline"
                title="Outline"
              >
                <List size={16} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[60] w-80 p-0">
              <PdfOutline
                entries={displayedOutline}
                onSelect={handleOutlineSelect}
                className="max-h-[70vh]"
              />
            </PopoverContent>
          </Popover>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1">
        {/* Left: Nolë chat */}
        {!isTabletPortrait && (
          <aside className="relative flex w-95 shrink-0 flex-col border-r bg-card [&>div]:shadow-none!">
            {isChatOpen ? (
              <ChatContainer onClose={() => setIsChatOpen(false)} />
            ) : (
              <div className="absolute bottom-4 left-4">
                <div className="canvas-ui-container px-0!">
                  <Button variant="ghost" onClick={() => setIsChatOpen(true)}>
                    <NoleIcon /> Nolë
                    <Kbd>N</Kbd>
                  </Button>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Middle: PDF viewer */}
        <main className="flex min-w-0 flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            className="h-full w-full overflow-y-auto"
          >
            <div
              ref={pageContainerRef}
              className="mx-auto flex w-full max-w-[60rem] flex-col items-center gap-4 px-8 py-8"
            >
              {pdfUrl ? (
                <Document
                  file={pdfUrl}
                  className="flex flex-col gap-4"
                  onLoadSuccess={onDocumentLoadSuccess}
                >
                  {Array.from({ length: numPages }, (_, index) => (
                    <div
                      key={`page_${index + 1}`}
                      ref={(el) => {
                        pageRefs.current[index] = el;
                      }}
                    >
                      <Page pageNumber={index + 1} width={debouncedWidth} />
                    </div>
                  ))}
                </Document>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No PDF available
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right: outline */}
        {!isTabletPortrait && (
          <aside className="flex w-95 shrink-0 flex-col border-l bg-card">
            <PdfOutline
              entries={displayedOutline}
              onSelect={scrollToPage}
              className="h-full"
            />
          </aside>
        )}
      </div>
    </FullscreenWindowFrame>
  );
}

function PdfOutline({
  entries,
  onSelect,
  className,
}: {
  entries: OutlineEntry[];
  onSelect: (pageIndex: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Outline
      </div>
      <div className="flex-1 overflow-auto p-2">
        {entries.length === 0 ? (
          <div className="px-2 py-4 text-sm text-muted-foreground/70">
            Aucun sommaire disponible.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {entries.map((entry, index) => (
              <li key={`${entry.pageIndex}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.pageIndex)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    entry.level === 1 && "font-semibold text-foreground",
                    entry.level === 2 && "pl-4",
                    entry.level === 3 && "pl-6 text-muted-foreground",
                    entry.level >= 4 && "pl-8 text-xs text-muted-foreground",
                  )}
                  title={entry.title}
                >
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
