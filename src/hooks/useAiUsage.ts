import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { enumerateDays, shiftUtcDay, todayUtcDay } from "@/lib/usageDays";

/**
 * `granularity` décide de la maille du graphe, pas de celle des données : le
 * serveur renvoie toujours du journalier. Au-delà de 90 jours, 365 barres dans
 * la largeur d'une page ne laissent pas la place aux 2px de respiration entre
 * marques — on regroupe par mois plutôt que d'afficher une bouillie. Le
 * tableau, lui, reste journalier quelle que soit la période.
 */
export const USAGE_PERIODS = [
  { value: "7d", label: "7 days", days: 7, granularity: "day" },
  { value: "30d", label: "30 days", days: 30, granularity: "day" },
  { value: "90d", label: "90 days", days: 90, granularity: "day" },
  { value: "12m", label: "12 months", days: 365, granularity: "month" },
] as const;

export type UsagePeriodValue = (typeof USAGE_PERIODS)[number]["value"];
export type UsageGranularity = (typeof USAGE_PERIODS)[number]["granularity"];

export type UsageDay = {
  day: string;
  costUsd: number;
  totalTokens: number;
  eventsCount: number;
  eventsMissingCostCount: number;
};

/** Une barre du graphe : une journée, ou un mois quand la période est longue. */
export type UsageBucket = UsageDay & {
  /** Journées agrégées dans cette barre, pour l'étiquette de tooltip. */
  fromDay: string;
  toDay: string;
};

export type AiUsage = {
  isLoading: boolean;
  fromDay: string;
  toDay: string;
  totalCostUsd: number;
  totalTokens: number;
  eventsCount: number;
  eventsMissingCostCount: number;
  truncated: boolean;
  /** Une entrée par journée de la plage, trous compris (à zéro). */
  days: UsageDay[];
  granularity: UsageGranularity;
  /** Les barres du graphe, à la maille de `granularity`. */
  buckets: UsageBucket[];
  /** Coût de barre le plus élevé de la plage, pour l'échelle du graphe. */
  maxBucketCostUsd: number;
  byModel: {
    model: string;
    costUsd: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    eventsCount: number;
    eventsMissingCostCount: number;
  }[];
};

/** Regroupe des journées contiguës en barres, à la maille demandée. */
function toBuckets(
  days: UsageDay[],
  granularity: UsageGranularity,
): UsageBucket[] {
  if (granularity === "day") {
    return days.map((day) => ({ ...day, fromDay: day.day, toDay: day.day }));
  }

  const buckets = new Map<string, UsageBucket>();
  for (const day of days) {
    // "YYYY-MM" : même propriété que la clé journalière, l'ordre
    // lexicographique reste l'ordre chronologique.
    const key = day.day.slice(0, 7);
    const bucket = buckets.get(key) ?? {
      day: key,
      costUsd: 0,
      totalTokens: 0,
      eventsCount: 0,
      eventsMissingCostCount: 0,
      fromDay: day.day,
      toDay: day.day,
    };
    bucket.costUsd += day.costUsd;
    bucket.totalTokens += day.totalTokens;
    bucket.eventsCount += day.eventsCount;
    bucket.eventsMissingCostCount += day.eventsMissingCostCount;
    bucket.toDay = day.day;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values());
}

export function useAiUsage(period: UsagePeriodValue): AiUsage {
  // « Aujourd'hui » est capturé une fois au montage : le recalculer à chaque
  // rendu changerait les arguments de la query et churnerait l'abonnement
  // Convex pour rien.
  const [today] = useState(todayUtcDay);

  const config = useMemo(
    () => USAGE_PERIODS.find((p) => p.value === period) ?? USAGE_PERIODS[1],
    [period],
  );

  const range = useMemo(
    () => ({
      fromDay: shiftUtcDay(today, -(config.days - 1)),
      toDay: today,
    }),
    [config, today],
  );

  const data = useQuery(api.aiUsage.getDailyUsage, range);

  return useMemo(() => {
    // La query ne renvoie que les journées ayant consommé ; le graphe a besoin
    // d'une suite contiguë, donc on remplit les trous ici, côté client, qui
    // connaît déjà la plage qu'il a demandée.
    const byDay = new Map((data?.days ?? []).map((d) => [d.day, d]));
    const days: UsageDay[] = enumerateDays(range.fromDay, range.toDay).map(
      (day) =>
        byDay.get(day) ?? {
          day,
          costUsd: 0,
          totalTokens: 0,
          eventsCount: 0,
          eventsMissingCostCount: 0,
        },
    );

    const buckets = toBuckets(days, config.granularity);

    return {
      isLoading: data === undefined,
      fromDay: range.fromDay,
      toDay: range.toDay,
      totalCostUsd: data?.totalCostUsd ?? 0,
      totalTokens: data?.totalTokens ?? 0,
      eventsCount: data?.eventsCount ?? 0,
      eventsMissingCostCount: data?.eventsMissingCostCount ?? 0,
      truncated: data?.truncated ?? false,
      days,
      granularity: config.granularity,
      buckets,
      maxBucketCostUsd: buckets.reduce((max, b) => Math.max(max, b.costUsd), 0),
      byModel: data?.byModel ?? [],
    };
  }, [data, range, config]);
}
