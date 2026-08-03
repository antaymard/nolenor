import { useCallback, useMemo, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { List } from "lucide-react";
import type { Block } from "@blocknote/core";
import {
  extractInlineText,
  parseStoredBlockNoteDocument,
} from "@/../convex/lib/blockNoteDocument";
import { cn } from "@/lib/utils";
import { type OpenedWindow } from "@/stores/windowsStore";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
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

type HeadingCandidate = {
  type?: string;
  props?: { level?: unknown };
  content?: unknown;
  children?: unknown;
  id?: string;
};

/**
 * Collect headings in document order, descending into `children` so titles
 * nested inside a toggle, a column or a list item are not silently dropped.
 * `path` only feeds the fallback id for blocks that somehow lack one, so it
 * just has to be unique per position.
 */
function collectHeadings(
  blocks: unknown,
  headings: Heading[],
  path: string,
): void {
  if (!Array.isArray(blocks)) return;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as HeadingCandidate | null;
    if (!block || typeof block !== "object") continue;
    const here = path ? `${path}-${i}` : `${i}`;
    if (block.type === "heading") {
      const title = extractInlineText(block.content).trim();
      if (title) {
        headings.push({
          id: block.id ?? `heading-${here}`,
          depth: typeof block.props?.level === "number" ? block.props.level : 1,
          title,
        });
      }
    }
    collectHeadings(block.children, headings, here);
  }
}

function extractHeadings(doc: Block[] | undefined): Heading[] {
  const headings: Heading[] = [];
  collectHeadings(doc, headings, "");
  return headings;
}

/** Identity of a heading list, used to skip state updates on every keystroke. */
function headingsSignature(headings: Heading[]): string {
  return JSON.stringify(headings.map((h) => [h.id, h.depth, h.title]));
}

export default function FullscreenBlocknoteWindow({
  openedWindow,
}: FullscreenBlocknoteWindowProps) {
  const { nodeDataId } = openedWindow;

  const [isChatOpen, setIsChatOpen] = useState(false);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  useHotkey("N", () => setIsChatOpen((v) => !v));

  // Seed the outline from the stored document so it is already populated on
  // open — the editor is mounted behind a `requestAnimationFrame`, so there is
  // a frame where nothing has emitted a document yet. Mirrors what the Plate
  // sibling does in FullscreenDocumentWindow.
  const docSource = useNodeDataValuesField<unknown>(nodeDataId, "doc");
  const initialHeadings = useMemo(
    () =>
      extractHeadings(
        (parseStoredBlockNoteDocument(docSource) ?? undefined) as
          | Block[]
          | undefined,
      ),
    [docSource],
  );

  // Only the derived outline is kept in state, and only when it actually
  // changes: `onDocChange` fires on every keystroke, and storing the whole
  // document here would re-render the chat panel and the outline each time.
  // `null` means "nothing emitted yet", which is distinct from "the document
  // has no heading" — otherwise the seed above could never show.
  const [liveHeadings, setLiveHeadings] = useState<Heading[] | null>(null);
  const headings = liveHeadings ?? initialHeadings;
  const headingsSignatureRef = useRef<string | null>(null);

  const handleDocChange = useCallback((doc: Block[]) => {
    const next = extractHeadings(doc);
    const signature = headingsSignature(next);
    if (signature === headingsSignatureRef.current) return;
    headingsSignatureRef.current = signature;
    setLiveHeadings(next);
  }, []);

  const scrollToHeading = useCallback((heading: Heading) => {
    const root = editorScrollRef.current;
    if (!root) return;
    // BlockNote tags each block wrapper with `data-id`, so we scroll to the
    // exact heading rather than to the nth <h*> in the DOM — those two drift
    // apart as soon as a heading is skipped (empty title) or nested. Matched by
    // attribute value rather than by selector: block ids may start with a digit,
    // which no escaping scheme handles cleanly inside a selector string.
    const target = Array.from(
      root.querySelectorAll<HTMLElement>("[data-id]"),
    ).find((el) => el.getAttribute("data-id") === heading.id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const isTabletPortrait = useIsTabletPortrait();
  const [outlineOpen, setOutlineOpen] = useState(false);

  const handleOutlineSelect = useCallback(
    (heading: Heading) => {
      scrollToHeading(heading);
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
  onSelect: (heading: Heading) => void;
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
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  type="button"
                  onClick={() => onSelect(heading)}
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
