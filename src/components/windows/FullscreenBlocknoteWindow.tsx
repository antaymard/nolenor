import { useCallback, useMemo, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { List } from "lucide-react";
import type { Block } from "@blocknote/core";
import { cn } from "@/lib/utils";
import { type OpenedWindow } from "@/stores/windowsStore";
import { useIsTabletPortrait } from "@/hooks/useTabletMode";
import BlocknoteWindow from "./prebuilt/BlocknoteWindow";
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

interface FullscreenBlocknoteWindowProps {
  openedWindow: OpenedWindow;
}

type Heading = { id: string; depth: number; title: string };

function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((child) => {
      if (!child || typeof child !== "object") return "";
      const c = child as { text?: unknown; content?: unknown };
      if (typeof c.text === "string") return c.text;
      if (c.content) return extractTextFromContent(c.content);
      return "";
    })
    .join("")
    .trim();
}

function extractHeadings(doc: Block[] | undefined): Heading[] {
  if (!doc || !Array.isArray(doc)) return [];
  const headings: Heading[] = [];
  for (let i = 0; i < doc.length; i++) {
    const block = doc[i] as {
      type?: string;
      props?: { level?: unknown };
      content?: unknown;
      id?: string;
    };
    if (block.type !== "heading") continue;
    const level = typeof block.props?.level === "number" ? block.props.level : 1;
    const title = extractTextFromContent(block.content);
    if (!title) continue;
    headings.push({
      id: block.id ?? `heading-${i}`,
      depth: level,
      title,
    });
  }
  return headings;
}

export default function FullscreenBlocknoteWindow({
  openedWindow,
}: FullscreenBlocknoteWindowProps) {
  const { nodeDataId } = openedWindow;

  const [isChatOpen, setIsChatOpen] = useState(false);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  useHotkey("N", () => setIsChatOpen((v) => !v));

  const [liveDoc, setLiveDoc] = useState<Block[] | null>(null);

  const headings = useMemo(() => extractHeadings(liveDoc ?? undefined), [liveDoc]);

  const handleDocChange = useCallback((doc: Block[]) => {
    setLiveDoc(doc);
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
              <BlocknoteOutline
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
        <main className="flex min-w-0 flex-1 overflow-hidden [&_.bn-editor]:px-[max(2rem,calc((100%-56rem)/2))]!">
          <div ref={editorScrollRef} className="h-full w-full">
            <BlocknoteWindow
              nodeDataId={nodeDataId}
              onDocChange={handleDocChange}
            />
          </div>
        </main>

        {/* Right: outline */}
        {!isTabletPortrait && (
          <aside className="flex w-95 shrink-0 flex-col border-l bg-white">
            <BlocknoteOutline
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

function BlocknoteOutline({
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
            Ajoutez des titres pour générer le sommaire.
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
