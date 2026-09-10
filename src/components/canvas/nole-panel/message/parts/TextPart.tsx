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

  // `overflow-x-clip` et non `auto` : `auto` ferait aussi de ce wrapper un
  // conteneur de scroll vertical, et le moindre dépassement d'encre (Poppins
  // 15px dans un interligne de 20px) y faisait apparaître une scrollbar
  // fantôme sur les blocs courts. Le code et les tableaux gèrent déjà leur
  // propre débordement (`pre`, wrapper de table).
  return (
    <div className="whitespace-pre-wrap px-1 overflow-x-clip py-2">
      <MarkdownText
        components={markdownComponents}
        remarkPlugins={[remarkNodeMentions]}
      >
        {deferredText}
      </MarkdownText>
    </div>
  );
});
