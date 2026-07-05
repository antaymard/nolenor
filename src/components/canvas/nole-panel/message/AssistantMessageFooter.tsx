import { TbBrain } from "react-icons/tb";
import { getModelLabel } from "@/lib/getModelLabel";
import { formatTokens } from "@/lib/formatUsage";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { ChatModelOption } from "@/types/convex";

/** Model + token line shown on hover under an assistant message. */
export function AssistantMessageFooter({
  metadata,
  modelOptions,
}: {
  metadata: Doc<"messageMetadata">;
  modelOptions?: readonly ChatModelOption[];
}) {
  const tokens = metadata.usage?.totalTokens;

  return (
    <div className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground/70">
      <TbBrain size={10} />
      <span>{getModelLabel(metadata.model, modelOptions)}</span>
      {tokens !== undefined && <span>· {formatTokens(tokens)} tk</span>}
    </div>
  );
}
