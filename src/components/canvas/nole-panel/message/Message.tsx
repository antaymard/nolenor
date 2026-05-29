import { memo } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { ChatModelOption } from "@/types/convex";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";

/** A single chat message — dispatches to the user or assistant renderer. */
export const Message = memo(function Message({
  message,
  metadata,
  modelOptions,
}: {
  message: UIMessage;
  metadata?: Doc<"messageMetadata">;
  modelOptions?: readonly ChatModelOption[];
}) {
  if (message.role === "user") {
    return <UserMessage text={message.text ?? ""} metadata={metadata} />;
  }
  return (
    <AssistantMessage
      message={message}
      metadata={metadata}
      modelOptions={modelOptions}
    />
  );
});
