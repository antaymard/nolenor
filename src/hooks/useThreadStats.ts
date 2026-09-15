import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { getModelMaxContext } from "@/lib/getModelLabel";
import type { ChatModelOption } from "@/types/convex";

/**
 * Un compteur de tokens d'une ligne de metadata.
 *
 * `usage` est un `v.record(v.string(), v.any())` : le typage ne garantit rien,
 * et un provider qui n'annonce pas l'un des compteurs le fait simplement
 * disparaître du document (Convex retire les champs `undefined`). Additionner
 * la valeur brute suffisait alors à propager un `NaN` dans tout le récapitulatif
 * — et à faire afficher « NaN tk » au survol du badge.
 */
function tokenCount(usage: Record<string, unknown>, key: string): number {
  const value = usage[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

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
  // Deux abonnements plutôt qu'un : le récapitulatif est minuscule mais
  // réinvalidé à chaque step LLM, les lignes grossissent avec la conversation
  // mais ne bougent qu'à l'insertion. Les mélanger faisait repasser tout
  // l'historique sur le websocket une quarantaine de fois par tour.
  //
  // `listThreadMessageMetadata` est déjà souscrit par `useThreadMessageMetadata`
  // dans la liste de messages : le client Convex déduplique, ce hook n'ajoute
  // pas de souscription.
  const summary = useQuery(
    api.messageMetadata.getThreadUsageSummary,
    threadId ? { threadId } : "skip",
  );
  const rows = useQuery(
    api.messageMetadata.listThreadMessageMetadata,
    threadId ? { threadId } : "skip",
  );

  return useMemo(() => {
    const isLoading = summary === undefined;

    const perModelMap = new Map<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }
    >();

    for (const row of rows ?? []) {
      if (row.role !== "assistant" || !row.usage) continue;

      const modelKey = row.model ?? "unknown";
      const prev = perModelMap.get(modelKey) ?? {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      perModelMap.set(modelKey, {
        inputTokens: prev.inputTokens + tokenCount(row.usage, "inputTokens"),
        outputTokens: prev.outputTokens + tokenCount(row.usage, "outputTokens"),
        totalTokens: prev.totalTokens + tokenCount(row.usage, "totalTokens"),
      });
    }

    const contextWindowUsed = summary?.contextWindowUsed ?? 0;
    const totalCostUsd = summary?.totalCostUsd ?? 0;
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
  }, [summary, rows, selectedModel, modelOptions]);
}
