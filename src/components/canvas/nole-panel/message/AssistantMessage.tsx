import type { UIMessage } from "@convex-dev/agent/react";
import { useMemo } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { cn } from "@/lib/utils";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { ChatModelOption } from "@/types/convex";
import { TextPart } from "./parts/TextPart";
import { ActivityGroup } from "./activity/ActivityGroup";
import { groupMessageParts } from "./activity/activityModel";
import { ErrorInline } from "./ErrorInline";
import { AssistantMessageFooter } from "./AssistantMessageFooter";
import { getMessageErrorText } from "./messageParsing";

/** An assistant message: text parts interleaved with collapsed activity blocks
 * (tool calls + reasoning), plus a processing spinner, error banner and hover
 * footer. */
export function AssistantMessage({
  message,
  metadata,
  modelOptions,
  isRunActive = false,
}: {
  message: UIMessage;
  /** Dernier message d'un tour que le serveur dit encore en cours. */
  isRunActive?: boolean;
  metadata?: Doc<"messageMetadata">;
  modelOptions?: readonly ChatModelOption[];
}) {
  // `streaming` ne couvre que les tokens en vol. Pendant qu'un tool s'exécute,
  // ou entre deux étapes, le message est `pending` : sans le statut serveur, le
  // bloc d'activité passerait en résumé, et le tool en cours en « stopped ».
  const isProcessing =
    message.status === "streaming" ||
    (isRunActive && message.status !== "failed");
  const isFailed = message.status === "failed";
  const messageError = getMessageErrorText(message);

  const blocks = useMemo(
    () => groupMessageParts(message.parts ?? [], isProcessing),
    [message.parts, isProcessing],
  );
  // Le bloc d'activité en queue affiche déjà l'étape en cours : l'orbe en plus
  // ferait deux indicateurs pour une seule attente.
  const tailIsActivity = blocks.at(-1)?.kind === "activity";

  return (
    <div className="flex justify-start group">
      <div
        className={cn(
          "whitespace-pre-wrap flex flex-col gap-2 p-2 py-3 w-full",
          isFailed && "bg-red-100",
        )}
      >
        {blocks.map((block, index) =>
          block.kind === "text" ? (
            <TextPart key={block.key} part={block.part} />
          ) : (
            <ActivityGroup
              key={block.key}
              steps={block.steps}
              isTail={isProcessing && index === blocks.length - 1}
            />
          ),
        )}

        {isProcessing && !tailIsActivity && (
          <div className="flex items-center px-1 py-1">
            <ThinkingOrb state="solving" size={20} aria-label="Nolë rédige" />
          </div>
        )}

        {isFailed && (
          <ErrorInline message={messageError || "An error occured."} />
        )}

        {!isProcessing && metadata?.model ? (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <AssistantMessageFooter
              metadata={metadata}
              modelOptions={modelOptions}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
