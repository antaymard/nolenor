import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  type Node,
  NodeResizeControl,
  ResizeControlVariant,
} from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { Toggle } from "@/components/shadcn/toggle";
import { LuHeading1, LuHeading2, LuHeading3 } from "react-icons/lu";
import { BiParagraph } from "react-icons/bi";
import { TbArrowAutofitWidth } from "react-icons/tb";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { useTitleNodeSizing } from "./useTitleNodeSizing";
import type { Id } from "@/../convex/_generated/dataModel";

type SizingMode = "auto" | "manual";

type TitleLevel = "h1" | "h2" | "h3" | "p";

const LEVELS: Array<{
  value: TitleLevel;
  icon: React.ReactNode;
  className: string;
}> = [
  { value: "h1", icon: <LuHeading1 />, className: "text-3xl font-semibold" },
  { value: "h2", icon: <LuHeading2 />, className: "text-2xl font-semibold" },
  { value: "h3", icon: <LuHeading3 />, className: "text-lg font-semibold" },
  { value: "p", icon: <BiParagraph />, className: "text-base font-normal" },
];

const PLACEHOLDER = "Click to edit...";
const RESIZE_THRESHOLD_PX = 2;

// Match the lineStyle used by NodeFrame's default NodeResizer for visual
// consistency with other nodes' resize handles.
const RESIZE_LINE_STYLE: CSSProperties = { borderWidth: 2 };

const GHOST_STYLE: CSSProperties = {
  position: "absolute",
  visibility: "hidden",
  pointerEvents: "none",
  left: -99999,
  top: 0,
  // Default; useTitleNodeSizing flips whiteSpace/width per mode before measuring.
  whiteSpace: "pre",
};

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function TitleNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { updateCanvasNode } = useUpdateCanvasNode();

  const text = (values?.text as string) || "";
  const level = ((values?.level as TitleLevel) || "p") as TitleLevel;
  const sizingMode: SizingMode =
    (xyNode.data?.titleSizing as SizingMode) ?? "auto";

  const editorRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const composingRef = useRef(false);
  const initialResizeWidthRef = useRef<number | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  // Live text drives the ghost measurer (and therefore the node size) while
  // the user types. The contentEditable element itself is NOT controlled by
  // React (writes happen via ref) to avoid caret jumps.
  const [liveText, setLiveText] = useState(text);

  // While the user is actively resizing, treat the node as manual locally.
  // This avoids two problems on auto-mode resizes: (1) re-measurement in the
  // sizing hook would override width back to the text width every frame so
  // the node wouldn't follow the cursor; (2) we'd fire updateCanvasNode on
  // every onResize, spamming Convex with display-props mutations. The switch
  // to manual is committed once on resize end.
  const effectiveSizingMode: SizingMode = isResizing ? "manual" : sizingMode;

  // Keep liveText in sync with persisted text outside of edit mode.
  useEffect(() => {
    if (!isEditing) setLiveText(text);
  }, [text, isEditing]);

  const textClassName = LEVELS.find((l) => l.value === level)?.className || "";
  const textColor =
    colors[(xyNode.data?.color as colorsEnum) || "default"]?.textColor;

  // ── Sizing ──────────────────────────────────────────────────────────────
  const { flushPendingPersist } = useTitleNodeSizing({
    nodeId: xyNode.id,
    ghostRef,
    isHydrated: values !== undefined,
    sizingMode: effectiveSizingMode,
    currentWidth: xyNode.width ?? 0,
    currentHeight: xyNode.height ?? 0,
    text,
    level,
    liveText: isEditing ? liveText : text,
    isEditing,
  });

  // ── Edit lifecycle ──────────────────────────────────────────────────────
  // When entering edit, populate the contentEditable imperatively and focus.
  useLayoutEffect(() => {
    if (!isEditing) return;
    const el = editorRef.current;
    if (!el) return;
    el.innerText = text;
    el.focus();
    placeCaretAtEnd(el);
  }, [isEditing, text]);

  const exitEditAndSave = useCallback(() => {
    if (!isEditing) return;
    const el = editorRef.current;
    const newText = el?.innerText ?? "";
    // Persist final dims before flipping isEditing: the post-save re-render
    // arrives with text already synced via Zustand and lastMeasuredRef in the
    // sizing hook matching, so the measure block would skip persisting.
    flushPendingPersist();
    setIsEditing(false);
    if (nodeDataId && newText !== text) {
      updateNodeDataValues({
        nodeDataId,
        values: { text: newText },
      });
    }
  }, [isEditing, nodeDataId, text, updateNodeDataValues, flushPendingPersist]);

  const cancelEdit = useCallback(() => {
    if (!isEditing) return;
    const el = editorRef.current;
    if (el) el.innerText = text;
    setLiveText(text);
    setIsEditing(false);
  }, [isEditing, text]);

  // ── Edit handlers ───────────────────────────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // First click selects the node (handled by React Flow). Subsequent
      // clicks while already selected enter edit mode.
      if (isEditing) return;
      if (!xyNode.selected) return;
      e.stopPropagation();
      setIsEditing(true);
    },
    [isEditing, xyNode.selected],
  );

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      if (composingRef.current) {
        // During IME composition, defer measurement and shortcut handling
        // until composition ends.
        setLiveText(e.currentTarget.innerText);
        return;
      }

      const el = e.currentTarget;
      const raw = el.innerText;

      // Markdown shortcut: "# ", "## ", "### " at the start of the line
      // bumps the level and rewrites the editor content in place.
      const match = raw.match(/^(#{1,3}) (.*)$/);
      if (match) {
        const newLevel = `h${match[1].length}` as TitleLevel;
        const stripped = match[2];
        if (nodeDataId && newLevel !== level) {
          updateNodeDataValues({
            nodeDataId,
            values: { level: newLevel },
          });
        }
        el.innerText = stripped;
        placeCaretAtEnd(el);
        setLiveText(stripped);
        return;
      }

      setLiveText(raw);
    },
    [level, nodeDataId, updateNodeDataValues],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        exitEditAndSave();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    },
    [exitEditAndSave, cancelEdit],
  );

  const handleBlur = useCallback(() => {
    if (composingRef.current) return;
    exitEditAndSave();
  }, [exitEditAndSave]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text/plain");
      // Collapse newlines: a title is single-line in auto, and even in manual
      // mode users get cleaner behavior without literal \n in the text.
      const sanitized =
        sizingMode === "auto" ? pasted.replace(/\s*\n+\s*/g, " ") : pasted;
      // execCommand is deprecated but remains the cross-browser way to insert
      // text into a contentEditable while preserving native undo history.
      document.execCommand("insertText", false, sanitized);
    },
    [sizingMode],
  );

  // ── Resize detection ────────────────────────────────────────────────────
  const handleResizeStart = useCallback(() => {
    initialResizeWidthRef.current = xyNode.width ?? 0;
    setIsResizing(true);
  }, [xyNode.width]);

  const handleResizeEnd = useCallback(
    (
      _event: unknown,
      params: { width: number; height: number; x: number; y: number },
    ) => {
      const initial = initialResizeWidthRef.current ?? 0;
      initialResizeWidthRef.current = null;
      setIsResizing(false);
      if (
        sizingMode !== "manual" &&
        Math.abs(params.width - initial) >= RESIZE_THRESHOLD_PX
      ) {
        void updateCanvasNode({
          nodeId: xyNode.id,
          data: { titleSizing: "manual" },
        });
      }
    },
    [sizingMode, updateCanvasNode, xyNode.id],
  );

  // xyflow's onResizeEnd only fires if at least one onResize was emitted
  // (resizeDetected guard). If the user clicks the handle and releases
  // without moving, neither fires — so we always reset isResizing on the
  // global pointerup as a safety net.
  useEffect(() => {
    if (!isResizing) return;
    const handleUp = () => setIsResizing(false);
    document.addEventListener("pointerup", handleUp);
    return () => document.removeEventListener("pointerup", handleUp);
  }, [isResizing]);

  // ── Auto-fit toggle from the toolbar ────────────────────────────────────
  const handleToggleSizing = useCallback(
    (pressed: boolean) => {
      void updateCanvasNode({
        nodeId: xyNode.id,
        data: { titleSizing: pressed ? "auto" : "manual" },
      });
    },
    [updateCanvasNode, xyNode.id],
  );

  if (!xyNode || !nodeDataId) return null;

  const displayText = isEditing ? liveText : text;
  const showPlaceholder = !isEditing && displayText.length === 0;

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        {/* Change heading */}
        <ToggleGroup
          type="single"
          variant="outline"
          className="bg-card"
          value={level}
          onValueChange={(value) => {
            if (value && nodeDataId) {
              updateNodeDataValues({
                nodeDataId,
                values: { level: value },
              });
            }
          }}
        >
          {LEVELS.map((l) => (
            <ToggleGroupItem key={l.value} value={l.value}>
              {l.icon}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {/* Auto-fit width */}
        <Toggle
          variant="outline"
          className="bg-card"
          pressed={sizingMode === "auto"}
          onPressedChange={handleToggleSizing}
          aria-label="Auto-fit width"
          title="Auto-fit width to text"
        >
          <TbArrowAutofitWidth />
        </Toggle>
      </CanvasNodeToolbar>

      {/* Custom resizer: only horizontal line handles on left/right edges.
          We disable NodeFrame's default resizer (which has corners + vertical
          handles) because in manual mode height is auto-derived from the
          wrap, not user-controlled. resizeDirection="horizontal" guarantees
          React Flow only mutates width — height stays under our hook's
          control, so releasing the handle no longer snaps height to one
          line. */}
      {xyNode.selected ? (
        <>
          <NodeResizeControl
            variant={ResizeControlVariant.Line}
            position="left"
            resizeDirection="horizontal"
            minWidth={50}
            style={RESIZE_LINE_STYLE}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
          />
          <NodeResizeControl
            variant={ResizeControlVariant.Line}
            position="right"
            resizeDirection="horizontal"
            minWidth={50}
            style={RESIZE_LINE_STYLE}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
          />
        </>
      ) : null}

      <NodeFrame xyNode={xyNode} resizable={false}>
        <div className="overflow-hidden p-1 px-2">
          <div
            ref={editorRef}
            contentEditable={isEditing}
            suppressContentEditableWarning
            spellCheck={isEditing}
            role="textbox"
            aria-multiline={sizingMode === "manual"}
            onClick={handleClick}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onPaste={handlePaste}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(e) => {
              composingRef.current = false;
              setLiveText(e.currentTarget.innerText);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={cn(
              textClassName,
              textColor,
              "outline-none cursor-text",
              isEditing && "nodrag",
              effectiveSizingMode === "auto"
                ? "whitespace-pre"
                : "whitespace-pre-wrap break-words",
              showPlaceholder && "text-muted-foreground/50 italic",
            )}
          >
            {/* In read mode, React owns the text. In edit mode, the DOM owns
                the text — we set it imperatively on entry to avoid caret
                jumps caused by React reconciling user input. */}
            {isEditing ? null : showPlaceholder ? PLACEHOLDER : text}
          </div>

          {/* Hidden ghost that drives sizing measurements. */}
          <span
            ref={ghostRef}
            aria-hidden
            className={cn(textClassName)}
            style={GHOST_STYLE}
          >
            {displayText.length === 0 ? PLACEHOLDER : displayText}
          </span>
        </div>
      </NodeFrame>
    </>
  );
}

export default memo(TitleNode, areNodePropsEqual);
