import { useCallback, useMemo, useRef, useState } from "react";
import { List } from "lucide-react";
import type { Block } from "@blocknote/core";
import { parseStoredBlockNoteDocument } from "@/../convex/lib/blockNoteDocument";
import { type OpenedWindow } from "@/stores/windowsStore";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
import { useIsTabletPortrait } from "@/hooks/useTabletMode";
import {
  extractHeadings,
  headingsSignature,
  type Heading,
} from "@/lib/blocknoteOutline";
import { BlocknoteOutlinePanel } from "./side-panel/BlocknoteOutlinePanel";
import BlocknoteWindow from "./prebuilt/BlocknoteWindow";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import FullscreenWindowFrame from "./FullscreenWindowFrame";
import { NoleAside } from "./FullscreenNolePanel";

interface FullscreenBlocknoteWindowProps {
  openedWindow: OpenedWindow;
}

export default function FullscreenBlocknoteWindow({
  openedWindow,
}: FullscreenBlocknoteWindowProps) {
  const { nodeDataId } = openedWindow;

  const editorScrollRef = useRef<HTMLDivElement>(null);

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
              <BlocknoteOutlinePanel
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
        {/* Left: Nolë chat */}
        {!isTabletPortrait && <NoleAside />}

        {/* Middle: editor (full width container, content centered) */}
        <main className="flex min-w-0 flex-1 overflow-hidden [&_.bn-editor]:px-[max(1rem,calc((100%-56rem)/2))]!">
          <div ref={editorScrollRef} className="h-full w-full overflow-y-auto">
            <BlocknoteWindow
              nodeDataId={nodeDataId}
              onDocChange={handleDocChange}
            />
          </div>
        </main>

        {/* Right: outline */}
        {!isTabletPortrait && (
          <aside className="flex w-95 shrink-0 flex-col border-l bg-white">
            <BlocknoteOutlinePanel
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
