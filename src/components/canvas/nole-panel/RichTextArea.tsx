// Ici, textarea qui peut faire du @ et avoir un dropdown de suggestions de nodeData du canvas (utiliser le store) et afficher les ref sous forme de pill, qu'on peut X pour les supprimer. En gros, un textarea enrichi pour faire du rich text avec des références à d'autres nodes du canvas.

import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useCallback, useEffect, useRef } from "react";
import { MentionsInput, Mention } from "react-mentions";
import { useNodes } from "@xyflow/react";
import {
  getNodeDataTitle,
  getNodeIcon,
} from "@/components/utils/nodeDataDisplayUtils";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface RichTextAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  maxHeightPx?: number;
}

export default function RichTextArea({
  value,
  onChange,
  onSubmit,
  maxHeightPx,
}: RichTextAreaProps) {
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  const canvasNodes = useNodes();

  const nodesToMention = canvasNodes
    .filter((node) => node.data?.nodeDataId)
    .map((node) => {
      const nodeDataId = node.data.nodeDataId as Id<"nodeDatas">;
      const nodeData = nodeDatas.get(nodeDataId);
      return {
        id: node.id,
        display: nodeData ? getNodeDataTitle(nodeData) : node.id,
      };
    });

  const wrapperRef = useRef<HTMLDivElement>(null);

  const autoResize = useCallback(() => {
    const textarea = wrapperRef.current?.querySelector("textarea");
    if (textarea) {
      const control = textarea.parentElement as HTMLElement | null;
      const highlighter = control?.querySelector("div") as HTMLElement | null;

      const effectiveMaxHeightPx =
        maxHeightPx ?? wrapperRef.current?.parentElement?.clientHeight;

      textarea.style.height = "auto";

      if (effectiveMaxHeightPx && effectiveMaxHeightPx > 0) {
        const nextHeight = Math.min(
          textarea.scrollHeight,
          effectiveMaxHeightPx,
        );
        const nextHeightPx = `${nextHeight}px`;

        textarea.style.height = `${nextHeight}px`;
        textarea.style.overflowY =
          textarea.scrollHeight > effectiveMaxHeightPx ? "auto" : "hidden";

        if (control) {
          control.style.height = nextHeightPx;
          control.style.minHeight = "2.5rem";
        }
        if (highlighter) {
          highlighter.style.height = nextHeightPx;
          highlighter.style.overflow = "hidden";
        }
      } else {
        const nextHeightPx = `${textarea.scrollHeight}px`;

        textarea.style.height = nextHeightPx;
        textarea.style.overflowY = "hidden";

        if (control) {
          control.style.height = nextHeightPx;
          control.style.minHeight = "2.5rem";
        }
        if (highlighter) {
          highlighter.style.height = nextHeightPx;
          highlighter.style.overflow = "hidden";
        }
      }
    }
  }, [maxHeightPx]);

  useEffect(() => {
    requestAnimationFrame(autoResize);
  }, [autoResize, value]);

  return (
    <div ref={wrapperRef}>
      <MentionsInput
        autoFocus
        style={{
          input: {
            resize: "none",
            overflowY: "hidden",
            outline: "none",
            padding: "3px",
            minHeight: "2.5rem",
            maxHeight: maxHeightPx ? `${maxHeightPx}px` : "100%",
          },
          highlighter: { outline: "none" },
        }}
        value={value}
        placeholder="Type your question, mention nodes using '@'"
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Enter") {
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              // Shift/Ctrl/Cmd+Enter → new line (default behavior)
              return;
            }
            // Enter alone → send
            e.preventDefault();
            onSubmit?.();
          }
        }}
        onChange={(_, newValue) => {
          onChange(newValue);
          requestAnimationFrame(autoResize);
        }}
        customSuggestionsContainer={(children) => (
          <div className="rounded shadow-lg border flex overflow-hidden">
            {children}
          </div>
        )}
      >
        <Mention
          trigger="@"
          data={nodesToMention}
          markup="@{{__id__||__display__}}"
          displayTransform={(_id, display) => `@${display}`}
          renderSuggestion={(
            entry,
            _search,
            _highlightedDisplay,
            _index,
            focused,
          ) => {
            const node = canvasNodes.find(
              (candidate) => candidate.id === entry.id,
            );
            const nodeDataId = node?.data?.nodeDataId as
              | Id<"nodeDatas">
              | undefined;
            const nodeData = nodeDataId ? nodeDatas.get(nodeDataId) : undefined;
            const Icon = getNodeIcon(nodeData?.type);
            return (
              <div
                className={cn(
                  focused && "bg-muted",
                  "p-2 flex items-center gap-2",
                )}
              >
                {Icon && <Icon />}
                {entry.display}
              </div>
            );
          }}
        />
      </MentionsInput>
    </div>
  );
}
