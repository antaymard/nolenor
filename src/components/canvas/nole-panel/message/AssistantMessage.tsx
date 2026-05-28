import type { UIMessage } from "@convex-dev/agent/react";
import { RiLoaderLine } from "react-icons/ri";
import { cn } from "@/lib/utils";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { ChatModelOption } from "@/types/convex";
import type { TextPart as TextPartType } from "@/types/domain/message.types";
import { TextPart } from "./parts/TextPart";
import { ReasoningPart } from "./parts/ReasoningPart";
import { ToolPart } from "./parts/ToolPart";
import { ErrorInline } from "./ErrorInline";
import { AssistantMessageFooter } from "./AssistantMessageFooter";
import {
  getMessageErrorText,
  getToolPartErrorText,
  isRecord,
  type ToolPartState,
} from "./messageParsing";

/** An assistant message: a sequence of reasoning / text / tool parts, plus a
 * processing spinner, error banner and hover footer. */
export function AssistantMessage({
  message,
  metadata,
  modelOptions,
}: {
  message: UIMessage;
  metadata?: Doc<"messageMetadata">;
  modelOptions?: readonly ChatModelOption[];
}) {
  const isProcessing = message.status === "streaming";
  const isFailed = message.status === "failed";
  const messageError = getMessageErrorText(message);

  return (
    <div className="flex justify-start group">
      <div
        className={cn(
          "whitespace-pre-wrap flex flex-col gap-2 p-2 py-3 w-full",
          isFailed && "bg-red-100",
        )}
      >
        {(message.parts ?? []).map((part, index) => (
          <MessagePart key={index} part={part} />
        ))}

        {isProcessing && (
          <div className="flex items-center py-1 px-1">
            <RiLoaderLine size={15} className="animate-spin text-slate-400" />
          </div>
        )}

        {isFailed && (
          <ErrorInline message={messageError || "Une erreur est survenue."} />
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

type Part = NonNullable<UIMessage["parts"]>[number];

function MessagePart({ part }: { part: Part }) {
  if (part.type === "step-start") return null;

  if (part.type === "reasoning") {
    return <ReasoningPart part={part} />;
  }

  if (part.type === "text") {
    return <TextPart part={part as TextPartType} />;
  }

  if (part.type.startsWith("tool-")) {
    const state = (
      "state" in part ? part.state : "input-streaming"
    ) as ToolPartState;
    return (
      <ToolPart
        state={state}
        name={part.type.replace("tool-", "")}
        error={getToolPartErrorText(part, state)}
        input={isRecord(part) && "input" in part ? part.input : undefined}
        output={isRecord(part) && "output" in part ? part.output : undefined}
      />
    );
  }

  return null;
}
