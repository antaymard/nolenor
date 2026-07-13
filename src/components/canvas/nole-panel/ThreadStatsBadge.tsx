import { TbDatabase } from "react-icons/tb";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { useThreadStats } from "@/hooks/useThreadStats";
import { getModelLabel } from "@/lib/getModelLabel";
import { formatCost, formatTokens } from "@/lib/formatUsage";
import type { ChatModelOption } from "@/types/convex";

type ThreadStatsBadgeProps = {
  threadId: string | null | undefined;
  selectedModel: string | undefined;
  modelOptions: readonly ChatModelOption[] | undefined;
};

/**
 * Small badge in the chat header showing context-window usage and cost for the
 * current thread, with a per-model breakdown in the tooltip.
 */
export default function ThreadStatsBadge({
  threadId,
  selectedModel,
  modelOptions,
}: ThreadStatsBadgeProps) {
  const stats = useThreadStats({ threadId, selectedModel, modelOptions });

  if (stats.isLoading || stats.contextWindowUsed === 0) return null;

  const percentLabel =
    stats.contextPercent !== undefined
      ? `${stats.contextPercent < 1 ? stats.contextPercent.toFixed(1) : Math.round(stats.contextPercent)}%`
      : null;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 px-1.5 py-0.5 rounded-sm hover:bg-slate-100 cursor-default">
          <TbDatabase size={10} />
          {percentLabel ? <span>{percentLabel}</span> : null}
          {stats.totalCostUsd > 0 ? (
            <span>· {formatCost(stats.totalCostUsd)}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-xs">
        <div className="flex flex-col gap-1">
          <p className="font-medium">Thread usage</p>
          {stats.perModel.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {stats.perModel.map((m) => (
                <div key={m.model} className="flex justify-between gap-2">
                  <span>{getModelLabel(m.model, modelOptions)}</span>
                  <span className="text-slate-300">
                    {formatTokens(m.totalTokens)} tk
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-slate-300 mt-1">
            Contexte actuel : {formatTokens(stats.contextWindowUsed)} tk
            {stats.maxContext ? ` / ${formatTokens(stats.maxContext)} tk` : ""}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
