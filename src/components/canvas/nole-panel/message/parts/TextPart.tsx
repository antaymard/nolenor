import { useSmoothText } from "@convex-dev/agent/react";
import { memo, useDeferredValue, useMemo } from "react";
import { MarkdownText } from "@/components/ai/MarkdownText";
import type { TextPart as TextPartType } from "@/types/domain/message.types";
import { markdownComponents, preprocessTextWithNodeLinks } from "../nodeLinks";

/** Renders an assistant `text` part as streaming markdown with node links. */
export const TextPart = memo(function TextPart({
  part,
}: {
  part: TextPartType;
}) {
  const [visibleText] = useSmoothText(part.text ?? "", {
    startStreaming: part.state === "streaming",
  });
  const deferredText = useDeferredValue(visibleText);
  const processed = useMemo(
    () => preprocessTextWithNodeLinks(deferredText),
    [deferredText],
  );

  if (!visibleText) return null;

  return (
    <div className="whitespace-pre-wrap px-1 overflow-x-auto">
      <MarkdownText components={markdownComponents}>{processed}</MarkdownText>
    </div>
  );
});
