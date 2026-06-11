import { useCallback, useMemo, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { List } from "lucide-react";
import type { Value } from "platejs";
import { cn } from "@/lib/utils";
import { type OpenedWindow } from "@/stores/windowsStore";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
import { useIsTabletPortrait } from "@/hooks/useTabletMode";
import DocumentWindow from "./prebuilt/DocumentWindow";
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
import { parseStoredPlateDocument } from "@/../convex/lib/plateDocumentStorage";

interface FullscreenDocumentWindowProps {
  openedWindow: OpenedWindow;
}

type Heading = { id: string; depth: number; title: string };

const HEADING_TYPE_RE = /^h([1-6])$/;

function extractHeadings(doc: Value | undefined): Heading[] {
  if (!doc) return [];
  const headings: Heading[] = [];
  for (const node of doc) {
    const type = (node as { type?: string }).type ?? "";
    const match = HEADING_TYPE_RE.exec(type);
    if (!match) continue;
    const children = (node as { children?: Array<{ text?: string }> }).children;
    const title = children?.map((c) => c?.text ?? "").join("").trim() ?? "";
    if (!title) continue;
    headings.push({
      id: (node as { id?: string }).id ?? `heading-${headings.length}`,
      depth: parseInt(match[1], 10),
      title,
    });
  }
  return headings;
}

export default function FullscreenDocumentWindow({
  openedWindow,
}: FullscreenDocumentWindowProps) {
  const { xyNodeId, nodeDataId } = openedWindow;
  const docSource = useNodeDataValuesField<unknown>(nodeDataId, "doc");

  const [isChatOpen, setIsChatOpen] = useState(false);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  useHotkey("N", () => setIsChatOpen((v) => !v));

  const initialHeadings = useMemo(() => {
    const parsed = parseStoredPlateDocument(docSource) as Value | null;
    return extractHeadings(parsed ?? undefined);
  }, [docSource]);
  const [liveHeadings, setLiveHeadings] = useState<Heading[] | null>(null);
  const headings = liveHeadings ?? initialHeadings;

  const handleDocChange = useCallback((doc: Value) => {
    setLiveHeadings(extractHeadings(doc));
  }, []);

  const scrollToHeading = useCallback((index: number) => {
    const root = editorScrollRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>(
      "h1, h2, h3, h4, h5, h6",
    );
    const target = els[index];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // On portrait tablets, drop the chat + outline side columns (which crush the
  // text into a narrow center) for a focused, full-width reading mode. The
  // outline moves into a header dropdown.
  const isTabletPortrait = useIsTabletPortrait();
  const [outlineOpen, setOutlineOpen] = useState(false);

  const handleOutlineSelect = useCallback(
    (index: number) => {
      scrollToHeading(index);
      setOutlineOpen(false);
    },
    [scrollToHeading],
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
                className="shrink-0 rounded p-1 opacity-60 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100"
                aria-label="Outline"
                title="Outline"
              >
                <List size={16} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[60] w-80 p-0">
              <DocumentOutline
                headings={headings}
                onSelect={handleOutlineSelect}
                className="max-h-[70vh]"
              />
            </PopoverContent>
          </Popover>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1">
        {/* Left: Nolë chat (always reserved to keep content centered) */}
        {!isTabletPortrait && (
          <aside className="relative flex w-95 shrink-0 flex-col border-r bg-white [&>div]:shadow-none!">
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

        {/* Middle: editor (full width container, content centered) */}
        <main className="flex min-w-0 flex-1 overflow-hidden [&_[data-slate-editor]]:px-[max(2rem,calc((100%-56rem)/2))]!">
          <div ref={editorScrollRef} className="h-full w-full">
            <DocumentWindow
              xyNodeId={xyNodeId}
              nodeDataId={nodeDataId}
              onDocChange={handleDocChange}
            />
          </div>
        </main>

        {/* Right: outline */}
        {!isTabletPortrait && (
          <aside className="flex w-95 shrink-0 flex-col border-l bg-white">
            <DocumentOutline
              headings={headings}
              onSelect={scrollToHeading}
              className="h-full"
            />
          </aside>
        )}
      </div>
    </FullscreenWindowFrame>
  );
}

function DocumentOutline({
  headings,
  onSelect,
  className,
}: {
  headings: Heading[];
  onSelect: (index: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Outline
      </div>
      <div className="flex-1 overflow-auto p-2">
        {headings.length === 0 ? (
          <div className="px-2 py-4 text-sm text-slate-400">
            Ajoutez des titres (h1, h2, h3) pour générer le sommaire.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {headings.map((heading, index) => (
              <li key={`${heading.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900",
                    heading.depth === 1 && "font-semibold text-slate-700",
                    heading.depth === 2 && "pl-4",
                    heading.depth === 3 && "pl-6 text-slate-500",
                    heading.depth >= 4 &&
                      "pl-8 text-xs text-slate-500",
                  )}
                  title={heading.title}
                >
                  {heading.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
