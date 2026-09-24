import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TbExclamationCircle } from "react-icons/tb";
import PageHeader from "@/components/app-shell/PageHeader";
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
      <PageHeader
        title="AI usage"
        subtitle="What your conversations, sub-agents and thread titles cost, day by day. Amounts are the ones OpenRouter bills."
        action={
          // Le sélecteur ne se comprime pas : sur un écran étroit il défile
          // horizontalement plutôt que de casser ses libellés.
          <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
            <AiUsagePeriodSelector value={period} onChange={setPeriod} />
          </div>
        }
      />

      {isEmpty ? (
        <div className="mt-6 flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm">
          <TbExclamationCircle /> No AI usage recorded over this period.
        </div>
      ) : (
        // Pas de squelette au refetch : on garde le rendu précédent en
        // opacité réduite, pour éviter le saut de mise en page.
        <div
          className={`mt-6 space-y-4 transition-opacity ${
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
