import { useSmoothText } from "@convex-dev/agent/react";
import { memo, useDeferredValue } from "react";
import { MarkdownText } from "@/components/ai/MarkdownText";
import { markdownComponents, remarkNodeMentions } from "../nodeLinks";

/**
 * Le texte d'une étape de raisonnement, monté à l'ouverture seulement : replié
 * — son état par défaut — il n'y a rien à lisser, et `useSmoothText` ferait
 * tourner un `slice` sur un texte qui grossit, vingt fois par seconde, pendant
 * toute la phase de réflexion.
 *
 * `startStreaming: false` : à l'ouverture en pleine réflexion, on veut lire ce
 * qui est déjà écrit tout de suite, pas le voir se retaper depuis le début.
 * `useSmoothText` affiche donc la valeur courante d'emblée, puis lisse la suite
 * — son `isStreaming` interne bascule dès que le texte dépasse le curseur.
 */
export const ReasoningBody = memo(function ReasoningBody({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const [visibleText] = useSmoothText(text, { startStreaming: false });
  const deferredText = useDeferredValue(visibleText);

  // Même raison qu'en `TextPart` : `clip` plutôt que `auto` pour ne pas
  // transformer ce panneau en conteneur de scroll vertical.
  return (
    <div className="whitespace-pre-wrap overflow-x-clip text-xs text-slate-500">
      <MarkdownText
        components={markdownComponents}
        remarkPlugins={[remarkNodeMentions]}
      >
        {deferredText || (isStreaming ? "..." : "")}
      </MarkdownText>
    </div>
  );
});
