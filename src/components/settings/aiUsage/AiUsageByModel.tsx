import { useQuery } from "convex/react";
import { TbAlertTriangle } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { formatCostCompact, formatTokens } from "@/lib/formatUsage";
import { getModelLabel } from "@/lib/getModelLabel";
import type { AiUsage } from "@/hooks/useAiUsage";

const SERIES = "#2a78d6";
const MUTED_INK = "#898781";

/**
 * Répartition par modèle. Une part-du-total dessinée derrière chaque ligne
 * plutôt qu'un camembert : les valeurs sont proches et un camembert ne
 * permettrait pas de les comparer.
 */
export default function AiUsageByModel({ usage }: { usage: AiUsage }) {
  const modelOptions = useQuery(api.ia.nole.listChatModels);

  if (usage.byModel.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 sm:p-4">
      <h2 className="mb-3 text-sm font-semibold text-[#0b0b0b]">By model</h2>
      {/* Cinq colonnes chiffrées ne tiennent pas sur un téléphone : le tableau
          défile plutôt que d'écraser ses colonnes. */}
      <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="text-xs text-[#52514e]">
            <tr className="border-b border-slate-200">
              <th className="py-2 pr-2 text-left font-medium">Model</th>
              <th className="py-2 pr-2 text-right font-medium">Cost</th>
              <th className="py-2 pr-2 text-right font-medium">Input</th>
              <th className="py-2 pr-2 text-right font-medium">Output</th>
              <th className="py-2 text-right font-medium">Calls</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {usage.byModel.map((row) => {
              const share =
                usage.totalCostUsd > 0
                  ? (row.costUsd / usage.totalCostUsd) * 100
                  : 0;
              return (
                <tr
                  key={row.model}
                  className="relative border-b border-slate-100 last:border-0"
                >
                  <td className="relative py-2 pr-2">
                    <span
                      className="absolute inset-y-1 left-0 rounded-sm"
                      style={{
                        width: `${share}%`,
                        backgroundColor: SERIES,
                        opacity: 0.1,
                      }}
                      aria-hidden
                    />
                    <span className="relative flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: SERIES }}
                        aria-hidden
                      />
                      <span className="text-[#0b0b0b]">
                        {getModelLabel(row.model, modelOptions)}
                      </span>
                      {row.eventsMissingCostCount > 0 ? (
                        <TbAlertTriangle
                          size={12}
                          className="shrink-0"
                          aria-label={`${row.eventsMissingCostCount} calls with no cost reported`}
                        />
                      ) : null}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-right text-[#0b0b0b]">
                    {formatCostCompact(row.costUsd)}
                  </td>
                  <td className="py-2 pr-2 text-right text-[#52514e]">
                    {formatTokens(row.inputTokens)}
                  </td>
                  <td className="py-2 pr-2 text-right text-[#52514e]">
                    {formatTokens(row.outputTokens)}
                  </td>
                  <td className="py-2 text-right text-[#52514e]">
                    {row.eventsCount.toLocaleString("en-US")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs" style={{ color: MUTED_INK }}>
        Input includes cached tokens, output includes reasoning tokens.
      </p>
    </div>
  );
}
