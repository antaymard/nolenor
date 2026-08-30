import { useSmoothText } from "@convex-dev/agent/react";
import { memo, useDeferredValue, useState } from "react";
import { TbBrain, TbChevronDown } from "react-icons/tb";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { cn } from "@/lib/utils";
import { markdownComponents, remarkNodeMentions } from "../nodeLinks";

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

  // Le lissage vit dans `ReasoningBody`, monté seulement quand le panneau est
  // ouvert. Replié — son état par défaut — il n'y a rien à animer, et
  // `useSmoothText` tournait quand même : un `slice` sur un texte de
  // raisonnement qui grossit, plus un rendu, vingt fois par seconde, pendant
  // toute la phase de réflexion. C'est le travail le plus inutile du fil.
  if (!part.text && !isStreaming) return null;

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
        <ReasoningBody text={part.text ?? ""} isStreaming={isStreaming} />
      ) : null}
    </div>
  );
});

/**
 * Le corps du panneau de raisonnement, monté à l'ouverture seulement.
 *
 * `startStreaming: false` : à l'ouverture en pleine réflexion, on veut lire ce
 * qui est déjà écrit tout de suite, pas le voir se retaper depuis le début.
 * `useSmoothText` affiche donc la valeur courante d'emblée, puis lisse la suite
 * — son `isStreaming` interne bascule dès que le texte dépasse le curseur.
 */
const ReasoningBody = memo(function ReasoningBody({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const [visibleText] = useSmoothText(text, { startStreaming: false });
  const deferredText = useDeferredValue(visibleText);

  return (
    <div className="border-t border-slate-200 px-2 py-2 whitespace-pre-wrap overflow-x-auto">
      <MarkdownText
        components={markdownComponents}
        remarkPlugins={[remarkNodeMentions]}
      >
        {deferredText || (isStreaming ? "..." : "")}
      </MarkdownText>
    </div>
  );
});
