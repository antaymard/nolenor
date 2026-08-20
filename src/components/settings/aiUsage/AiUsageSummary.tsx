import { TbAlertTriangle } from "react-icons/tb";
import { formatCostCompact, formatTokens } from "@/lib/formatUsage";
import { formatDayRange } from "@/lib/usageDays";
import type { AiUsage } from "@/hooks/useAiUsage";

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 sm:p-4">
      <div className="text-xs text-[#52514e]">{label}</div>
      {/* Chiffres proportionnels : `tabular-nums` fait paraître une grande
          valeur isolée trop lâche. Il est réservé aux colonnes du tableau. */}
      <div className="mt-1 text-xl font-semibold text-[#0b0b0b] sm:text-2xl">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-[#898781]">{hint}</div> : null}
    </div>
  );
}

export default function AiUsageSummary({ usage }: { usage: AiUsage }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Total cost"
          value={formatCostCompact(usage.totalCostUsd)}
          hint={`${formatDayRange(usage.fromDay, usage.toDay)} (UTC)`}
        />
        <StatTile
          label="Tokens"
          value={formatTokens(usage.totalTokens)}
          hint="Input and output combined"
        />
        <StatTile
          label="LLM calls"
          value={usage.eventsCount.toLocaleString("en-US")}
          hint="One per model step, not per message"
        />
      </div>

      {/* Un coût manquant n'est PAS un coût nul : sans ce bandeau, un $0 dû au
          silence de l'API serait indiscernable d'un modèle gratuit. Icône +
          libellé, jamais la couleur seule. */}
      {usage.eventsMissingCostCount > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-[#fab219] bg-[#fab219]/10 p-3 text-sm text-[#0b0b0b]">
          <TbAlertTriangle
            size={16}
            className="mt-0.5 shrink-0 text-[#0b0b0b]"
            aria-hidden
          />
          <p>
            <span className="font-medium">
              {usage.eventsMissingCostCount.toLocaleString("en-US")} of{" "}
              {usage.eventsCount.toLocaleString("en-US")} calls reported no cost.
            </span>{" "}
            Their tokens are counted, but their spend is missing from the total
            above — so the real amount is higher than what is shown.
          </p>
        </div>
      ) : null}

      {usage.truncated ? (
        <div className="flex items-start gap-2 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-[#52514e]">
          <TbAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>
            This period has more usage rows than a single read returns. The
            figures below are partial — narrow the period for an exact total.
          </p>
        </div>
      ) : null}
    </div>
  );
}
