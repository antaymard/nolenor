import { MarkdownText } from "@/components/ai/MarkdownText";
import type { Doc } from "@/../convex/_generated/dataModel";
import {
  extractUserMessageForDisplay,
  parseSubagentResult,
} from "../chatHelpers";
import { MessageAttachments } from "./MessageAttachments";
import { SubagentResultNotice } from "./SubagentResultNotice";

/** A user message bubble plus its attachment chips. */
export function UserMessage({
  text,
  metadata,
}: {
  text: string;
  metadata?: Doc<"messageMetadata">;
}) {
  // Message posté par l'app, pas par l'utilisateur.
  const subagentResult = parseSubagentResult(text);
  if (subagentResult) return <SubagentResultNotice {...subagentResult} />;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="text-text max-w-4/5 rounded-2xl rounded-br-sm border border-slate-200 bg-slate-100 px-3 py-2 whitespace-pre-wrap">
        <MarkdownText>{extractUserMessageForDisplay(text)}</MarkdownText>
      </div>
      {metadata?.attachments ? (
        <MessageAttachments attachments={metadata.attachments} />
      ) : null}
    </div>
  );
}
