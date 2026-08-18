import { useMemo, useState } from "react";
import { TbAlertTriangle, TbChartBar, TbTable } from "react-icons/tb";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { formatCostCompact, formatTokens } from "@/lib/formatUsage";
import { formatDayLong, formatDayShort, parseDayLocal } from "@/lib/usageDays";
import { format } from "@/lib/date-utils";
import type { AiUsage, UsageBucket } from "@/hooks/useAiUsage";

/**
 * Une seule série (le coût), donc pas de légende : le titre de la carte dit ce
 * qui est tracé. Bleu séquentiel slot 1, validé à 3:1 sur la surface.
 */
const SERIES = "#2a78d6";
const GRIDLINE = "#e1e0d9";
const BASELINE = "#c3c2b7";
const MUTED_INK = "#898781";

const PLOT_HEIGHT_PX = 168;
const GRIDLINE_COUNT = 4;

/**
 * Part d'appels sans coût à partir de laquelle une barre est hachurée. En
 * dessous, la hachure serait du bruit — sur une barre mensuelle, 58 appels sans
 * coût sur 3 700 ne fausse pas la hauteur de façon lisible. Le compte exact
 * reste dans le tooltip, le tableau et le bandeau de résumé, quel que soit le
 * ratio : c'est la hachure qui est sélective, pas l'information.
 */
const MISSING_COST_HATCH_RATIO = 0.2;

/** Plafond d'axe « propre » (1/2/5 × 10ⁿ) au-dessus de la plus haute barre. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Graduation d'axe : nombres ronds, sans décimales parasites. `$0.750` et
 * `$20.00` sont du bruit sur un axe, `$0.75` et `$20` disent la même chose.
 */
function formatAxisTick(value: number): string {
  if (value === 0) return "$0";
  const decimals = value >= 1 ? 0 : value >= 0.1 ? 2 : 3;
  const text = value.toFixed(decimals);
  // Les zéros de queue ne se retirent que s'il y a une virgule : sans ce
  // garde-fou, "20" devient "2".
  return `$${decimals > 0 ? text.replace(/\.?0+$/, "") : text}`;
}

function bucketLabel(bucket: UsageBucket, granularity: AiUsage["granularity"]) {
  return granularity === "month"
    ? format(parseDayLocal(`${bucket.day}-01`), "MMM yy")
    : formatDayShort(bucket.day);
}

function bucketTooltipTitle(
  bucket: UsageBucket,
  granularity: AiUsage["granularity"],
) {
  return granularity === "month"
    ? format(parseDayLocal(`${bucket.day}-01`), "MMMM yyyy")
    : formatDayLong(bucket.day);
}

function Bar({
  bucket,
  granularity,
  ceiling,
}: {
  bucket: UsageBucket;
  granularity: AiUsage["granularity"];
  ceiling: number;
}) {
  const heightPercent = (bucket.costUsd / ceiling) * 100;
  const hasMissingCost = bucket.eventsMissingCostCount > 0;
  const understatesCost =
    bucket.eventsCount > 0 &&
    bucket.eventsMissingCostCount / bucket.eventsCount >=
      MISSING_COST_HATCH_RATIO;

  return (
    <Tooltip delayDuration={80}>
      <TooltipTrigger asChild>
        {/* La cible de survol est toute la colonne, pas la barre : sur 90
            jours une barre fait 3px de large, impossible à viser. */}
        <button
          type="button"
          className="group relative flex h-full min-w-0 flex-1 cursor-default items-end focus:outline-none"
          aria-label={`${bucketTooltipTitle(bucket, granularity)}: ${formatCostCompact(bucket.costUsd)}`}
        >
          <span className="absolute inset-0 rounded-sm group-hover:bg-slate-900/5 group-focus-visible:bg-slate-900/10" />
          <span
            className="relative mx-auto rounded-t-[4px]"
            style={{
              // Plafonnée à 24px ET à 70% de la colonne : une barre qui
              // remplit sa case ne laisse aucune respiration entre voisines.
              width: "min(24px, 70%)",
              // Les journées sans dépense gardent une souche d'1px : un trou
              // doit se lire « pas d'usage », jamais « données manquantes ».
              height: `max(1px, ${heightPercent}%)`,
              backgroundColor: bucket.costUsd > 0 ? SERIES : BASELINE,
              // Encodage secondaire quand la barre sous-estime vraiment la
              // dépense : la couleur seule ne porte jamais l'information (cf.
              // le bandeau du résumé et la colonne du tableau).
              backgroundImage: understatesCost
                ? `repeating-linear-gradient(45deg, rgba(255,255,255,0.85) 0 2px, transparent 2px 5px)`
                : undefined,
            }}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">
            {bucketTooltipTitle(bucket, granularity)}
          </p>
          <p>{formatCostCompact(bucket.costUsd)}</p>
          <p className="text-slate-300">
            {formatTokens(bucket.totalTokens)} tk ·{" "}
            {bucket.eventsCount.toLocaleString("en-US")} calls
          </p>
          {hasMissingCost ? (
            <p className="mt-1 flex items-center gap-1 text-slate-300">
              <TbAlertTriangle size={11} aria-hidden />
              {bucket.eventsMissingCostCount.toLocaleString("en-US")} with no
              cost reported
            </p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ChartView({ usage }: { usage: AiUsage }) {
  const ceiling = useMemo(
    () => niceCeiling(usage.maxBucketCostUsd),
    [usage.maxBucketCostUsd],
  );

  // Une étiquette d'axe sur N, pour qu'elles ne se chevauchent jamais.
  const labelEvery = Math.max(1, Math.ceil(usage.buckets.length / 8));

  return (
    <div>
      <div className="flex gap-2 sm:gap-3">
        {/* Graduations : elles portent les valeurs qu'on ne libelle pas
            directement sur les barres. */}
        <div
          className="relative w-10 shrink-0 sm:w-12"
          style={{ height: PLOT_HEIGHT_PX }}
          aria-hidden
        >
          {Array.from({ length: GRIDLINE_COUNT + 1 }, (_, i) => (
            <span
              key={i}
              className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums"
              style={{
                bottom: `${(i / GRIDLINE_COUNT) * 100}%`,
                color: MUTED_INK,
              }}
            >
              {formatAxisTick((ceiling * i) / GRIDLINE_COUNT)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT_PX }}>
            {/* Hairlines pleines, une nuance au-dessus de la surface. */}
            {Array.from({ length: GRIDLINE_COUNT + 1 }, (_, i) => (
              <span
                key={i}
                className="absolute inset-x-0 h-px"
                style={{
                  bottom: `${(i / GRIDLINE_COUNT) * 100}%`,
                  backgroundColor: i === 0 ? BASELINE : GRIDLINE,
                }}
                aria-hidden
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {usage.buckets.map((bucket) => (
                <Bar
                  key={bucket.day}
                  bucket={bucket}
                  granularity={usage.granularity}
                  ceiling={ceiling}
                />
              ))}
            </div>
          </div>

          <div className="mt-1.5 flex gap-[2px]">
            {usage.buckets.map((bucket, index) => (
              <span
                key={bucket.day}
                className="min-w-0 flex-1 text-center text-[10px] whitespace-nowrap"
                style={{ color: MUTED_INK }}
              >
                {index % labelEvery === 0
                  ? bucketLabel(bucket, usage.granularity)
                  : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs" style={{ color: MUTED_INK }}>
        Days are counted in UTC, so late-evening activity in your timezone may
        land on the previous bar.
        {usage.granularity === "month"
          ? " Bars are monthly at this range; the table stays daily."
          : ""}{" "}
        A striped bar understates its real spend — OpenRouter reported no cost
        for a significant share of its calls.
      </p>
    </div>
  );
}

/**
 * Jumeau tableau du graphe : un tooltip ne doit jamais être le seul moyen de
 * lire une valeur. Toujours journalier, même quand le graphe est mensuel.
 */
function TableView({ usage }: { usage: AiUsage }) {
  const rows = useMemo(
    () => usage.days.filter((day) => day.eventsCount > 0).reverse(),
    [usage.days],
  );

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm" style={{ color: MUTED_INK }}>
        No usage recorded over this period.
      </p>
    );
  }

  return (
    <div className="-mx-3 max-h-80 overflow-auto px-3 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[26rem] text-sm tabular-nums">
        <thead className="sticky top-0 bg-white text-xs text-[#52514e]">
          <tr className="border-b border-slate-200">
            <th className="py-2 pr-2 text-left font-medium">Day (UTC)</th>
            <th className="py-2 pr-2 text-right font-medium">Cost</th>
            <th className="py-2 pr-2 text-right font-medium">Tokens</th>
            <th className="py-2 text-right font-medium">Calls</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((day) => (
            <tr key={day.day} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-2 text-[#0b0b0b]">
                {formatDayLong(day.day)}
              </td>
              <td className="py-1.5 pr-2 text-right text-[#0b0b0b]">
                {day.eventsMissingCostCount > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <TbAlertTriangle
                      size={12}
                      className="shrink-0"
                      aria-label={`${day.eventsMissingCostCount} calls with no cost reported`}
                    />
                    {formatCostCompact(day.costUsd)}
                  </span>
                ) : (
                  formatCostCompact(day.costUsd)
                )}
              </td>
              <td className="py-1.5 pr-2 text-right text-[#52514e]">
                {formatTokens(day.totalTokens)}
              </td>
              <td className="py-1.5 text-right text-[#52514e]">
                {day.eventsCount.toLocaleString("en-US")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AiUsageChart({ usage }: { usage: AiUsage }) {
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#0b0b0b]">
          Cost per {usage.granularity === "month" ? "month" : "day"}
        </h2>
        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1 text-xs text-[#52514e] hover:bg-slate-100"
        >
          {view === "chart" ? (
            <>
              <TbTable size={13} aria-hidden /> Table
            </>
          ) : (
            <>
              <TbChartBar size={13} aria-hidden /> Chart
            </>
          )}
        </button>
      </div>

      {view === "chart" ? (
        <ChartView usage={usage} />
      ) : (
        <TableView usage={usage} />
      )}
    </div>
  );
}
