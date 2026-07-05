import { MarkdownText } from "@/components/ai/MarkdownText";
import type { Doc } from "@/../convex/_generated/dataModel";
import { extractUserMessageForDisplay } from "../chatHelpers";
import { MessageAttachments } from "./MessageAttachments";

/** A user message bubble plus its attachment chips. */
export function UserMessage({
  text,
  metadata,
}: {
  text: string;
  metadata?: Doc<"messageMetadata">;
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="rounded-md whitespace-pre-wrap p-3 bg-accent border text-text max-w-4/5">
        <MarkdownText>{extractUserMessageForDisplay(text)}</MarkdownText>
      </div>
      {metadata?.attachments ? (
        <MessageAttachments attachments={metadata.attachments} />
      ) : null}
    </div>
  );
}
