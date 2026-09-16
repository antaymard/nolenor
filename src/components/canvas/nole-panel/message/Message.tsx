import { memo } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { ChatModelOption } from "@/types/convex";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { SubAgentReportMessage } from "./SubAgentReportMessage";
import { parseSubAgentReports } from "../chatHelpers";

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
    const text = message.text ?? "";
    // La remise d'un lot de sous-agents arrive par le même rôle qu'un envoi de
    // l'utilisateur (cf. `ia/subAgents.deliverIfReady`) : c'est au rendu de
    // faire la différence, sinon la conversation prête à l'humain un pavé de
    // XML qu'il n'a pas écrit.
    const reports = parseSubAgentReports(text);
    if (reports) {
      return <SubAgentReportMessage reports={reports} />;
    }
    return <UserMessage text={text} metadata={metadata} />;
  }
  return (
    <AssistantMessage
      message={message}
      metadata={metadata}
      modelOptions={modelOptions}
    />
  );
});
