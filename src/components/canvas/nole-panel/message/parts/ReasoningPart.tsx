import { useSmoothText } from "@convex-dev/agent/react";
import { memo, useDeferredValue, useMemo, useState } from "react";
import { TbBrain, TbChevronDown } from "react-icons/tb";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { cn } from "@/lib/utils";
import { markdownComponents, preprocessTextWithNodeLinks } from "../nodeLinks";

type ReasoningPartData = {
  type: "reasoning";
  text: string;
  state?: "streaming" | "done";
};

/** Collapsible "thinking" panel for an assistant `reasoning` part. */
export const ReasoningPart = memo(function ReasoningPart({
  part,
}: {
  part: ReasoningPartData;
}) {
  const isStreaming = part.state === "streaming";
  const [isExpanded, setIsExpanded] = useState(false);
  const [visibleText] = useSmoothText(part.text ?? "", {
    startStreaming: isStreaming,
  });
  const deferredText = useDeferredValue(visibleText);
  const processed = useMemo(
    () => preprocessTextWithNodeLinks(deferredText || "..."),
    [deferredText],
  );

  if (!visibleText && !isStreaming) return null;

  return (
    <div className="rounded border border-slate-300 bg-slate-50 text-xs text-slate-700">
      <button
        type="button"
        className="w-full flex items-center gap-1 px-2 py-1.5 text-left"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <TbBrain
          size={12}
          className={cn(isStreaming ? "animate-spin" : "opacity-70")}
        />
        <span>{isStreaming ? "Nole is thinking..." : "Thinking"}</span>
        <TbChevronDown
          size={12}
          className={cn(
            "ml-auto transition-transform",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      {isExpanded ? (
        <div className="border-t border-slate-200 px-2 py-2 whitespace-pre-wrap overflow-x-auto">
          <MarkdownText components={markdownComponents}>{processed}</MarkdownText>
        </div>
      ) : null}
    </div>
  );
});
