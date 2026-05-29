import { useSmoothText } from "@convex-dev/agent/react";
import { memo, useDeferredValue } from "react";
import { MarkdownText } from "@/components/ai/MarkdownText";
import type { TextPart as TextPartType } from "@/types/domain/message.types";
import { markdownComponents, remarkNodeMentions } from "../nodeLinks";

/** Renders an assistant `text` part as streaming markdown with node pills. */
export const TextPart = memo(function TextPart({
  part,
}: {
  part: TextPartType;
}) {
  const [visibleText] = useSmoothText(part.text ?? "", {
    startStreaming: part.state === "streaming",
  });
  const deferredText = useDeferredValue(visibleText);

  if (!visibleText) return null;

  return (
    <div className="whitespace-pre-wrap px-1 overflow-x-auto">
      <MarkdownText
        components={markdownComponents}
        remarkPlugins={[remarkNodeMentions]}
      >
        {deferredText}
      </MarkdownText>
    </div>
  );
});
