import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { getModelMaxContext } from "@/lib/getModelLabel";
import type { ChatModelOption } from "@/types/convex";

export type ThreadStats = {
  isLoading: boolean;
  contextWindowUsed: number;
  totalCostUsd: number;
  maxContext: number | undefined;
  contextPercent: number | undefined;
  perModel: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }[];
};

export function useThreadStats({
  threadId,
  selectedModel,
  modelOptions,
}: {
  threadId: string | null | undefined;
  selectedModel: string | undefined;
  modelOptions: readonly ChatModelOption[] | undefined;
}): ThreadStats {
  const data = useQuery(
    api.messageMetadata.getThreadMessageMetadata,
    threadId ? { threadId } : "skip",
  );

  return useMemo(() => {
    const isLoading = data === undefined;
    const rows = data?.messageMetadata ?? [];

    const perModelMap = new Map<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }
    >();

    for (const row of rows) {
      if (row.role !== "assistant" || !row.usage) continue;

      const modelKey = row.model ?? "unknown";
      const prev = perModelMap.get(modelKey) ?? {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      perModelMap.set(modelKey, {
        inputTokens: prev.inputTokens + row.usage.inputTokens,
        outputTokens: prev.outputTokens + row.usage.outputTokens,
        totalTokens: prev.totalTokens + row.usage.totalTokens,
      });
    }

    const contextWindowUsed = data?.contextWindowUsed ?? 0;
    const totalCostUsd = data?.totalCostUsd ?? 0;
    const maxContext = getModelMaxContext(selectedModel, modelOptions);
    const contextPercent =
      maxContext && maxContext > 0
        ? (contextWindowUsed / maxContext) * 100
        : undefined;

    return {
      isLoading,
      contextWindowUsed,
      totalCostUsd,
      maxContext,
      contextPercent,
      perModel: Array.from(perModelMap.entries()).map(([model, v]) => ({
        model,
        ...v,
      })),
    };
  }, [data, selectedModel, modelOptions]);
}
