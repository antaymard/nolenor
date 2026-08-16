import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TbExclamationCircle } from "react-icons/tb";
import AiUsagePeriodSelector from "@/components/settings/aiUsage/AiUsagePeriodSelector";
import AiUsageSummary from "@/components/settings/aiUsage/AiUsageSummary";
import AiUsageChart from "@/components/settings/aiUsage/AiUsageChart";
import AiUsageByModel from "@/components/settings/aiUsage/AiUsageByModel";
import { useAiUsage, type UsagePeriodValue } from "@/hooks/useAiUsage";

export const Route = createFileRoute("/settings/ai-usage")({
  component: RouteComponent,
});

function RouteComponent() {
  const [period, setPeriod] = useState<UsagePeriodValue>("30d");
  const usage = useAiUsage(period);

  const isEmpty = !usage.isLoading && usage.eventsCount === 0;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">AI usage</h1>
          <i className="text-sm text-muted-foreground not-italic">
            What your conversations, sub-agents and thread titles cost, day by
            day. Amounts are the ones OpenRouter bills.
          </i>
        </div>
        <AiUsagePeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isEmpty ? (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-slate-50 p-4 text-sm">
          <TbExclamationCircle /> No AI usage recorded over this period.
        </div>
      ) : (
        // Pas de squelette au refetch : on garde le rendu précédent en
        // opacité réduite, pour éviter le saut de mise en page.
        <div
          className={`mt-4 space-y-4 transition-opacity ${
            usage.isLoading ? "opacity-50" : "opacity-100"
          }`}
        >
          <AiUsageSummary usage={usage} />
          <AiUsageChart usage={usage} />
          <AiUsageByModel usage={usage} />
        </div>
      )}
    </div>
  );
}
