import { TbBrain } from "react-icons/tb";
import { getModelLabel } from "@/lib/getModelLabel";
import { formatCost, formatTokens } from "@/lib/formatUsage";
import type { Doc } from "@/../convex/_generated/dataModel";
import type { ChatModelOption } from "@/types/convex";

/** Model + token/cost line shown on hover under an assistant message. */
export function AssistantMessageFooter({
  metadata,
  modelOptions,
}: {
  metadata: Doc<"messageMetadata">;
  modelOptions?: readonly ChatModelOption[];
}) {
  const tokens = metadata.usage?.totalTokens;
  const cost = metadata.costUsd;

  const usageParts: string[] = [];
  if (tokens !== undefined) usageParts.push(`${formatTokens(tokens)} tk`);
  if (cost !== undefined && cost > 0) usageParts.push(formatCost(cost));

  return (
    <div className="flex items-center gap-1 px-1 text-[10px] text-slate-400">
      <TbBrain size={10} />
      <span>{getModelLabel(metadata.model, modelOptions)}</span>
      {usageParts.length > 0 && <span>· {usageParts.join(" · ")}</span>}
    </div>
  );
}
