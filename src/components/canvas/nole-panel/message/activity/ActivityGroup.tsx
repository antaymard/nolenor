import { memo, useMemo, useState } from "react";
import { TbChevronRight, TbLoader2 } from "react-icons/tb";
import { MentionedNodeCard } from "@/components/canvas/nole-panel/MentionedNodeCard";
import { cn } from "@/lib/utils";
import {
  summarizeActivity,
  type ActivityStep,
  type ActivitySummary,
} from "./activityModel";
import { ActivityStepRow } from "./ActivityStepRow";
import { getToolMeta, REASONING_ICON } from "./toolMeta";

/** Pastilles de nodes affichées sous le résumé avant le « +N ». */
const MAX_NODE_PILLS = 3;

const getToolIcon = (name: string) => getToolMeta(name).icon;

/**
 * Une suite d'actions de l'agent (tools + raisonnement), repliée en une ligne.
 *
 * - En cours : l'étape courante, en direct, avec son étiquette qui défile à
 *   chaque nouvel appel — on voit ce que fait Nolë sans que le fil grandisse.
 * - Fini : un résumé (« Read 3 nodes, edited 2 nodes »), les échecs en rouge,
 *   et les nodes créés ou modifiés en pastilles cliquables.
 * - Déplié : la timeline complète ; chaque ligne s'ouvre à son tour sur le
 *   détail brut de l'appel, pour débugger.
 */
export const ActivityGroup = memo(function ActivityGroup({
  steps,
  isTail,
}: {
  steps: ActivityStep[];
  /** Dernier bloc d'un message encore en streaming : l'agent travaille ici. */
  isTail: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const summary = useMemo(
    () => summarizeActivity(steps, getToolIcon),
    [steps],
  );

  const currentStep = findLast(steps, (s) => s.status === "running");
  const isLive = isTail || !!currentStep;
  // En direct, on montre l'étiquette de l'agent dès qu'on l'a : celle de
  // l'étape en cours, sinon — entre deux étapes, le modèle prépare la
  // suivante — celle de la dernière action. Le résumé chiffré attend la fin.
  const liveStep =
    currentStep ?? findLast(steps, (s) => s.kind === "tool");

  return (
    <div className="px-1 text-[13px] whitespace-normal">
      <button
        type="button"
        onClick={() => setIsExpanded((open) => !open)}
        aria-expanded={isExpanded}
        className="group/activity -mx-1.5 flex w-[calc(100%+0.75rem)] min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
      >
        {isLive ? (
          <LiveHeader step={liveStep} toolCount={summary.toolCount} />
        ) : (
          <SummaryHeader summary={summary} steps={steps} />
        )}
        <TbChevronRight
          size={13}
          className={cn(
            "shrink-0 text-slate-400 transition-[opacity,transform]",
            isExpanded
              ? "rotate-90 opacity-100"
              : "opacity-0 group-hover/activity:opacity-100",
          )}
        />
      </button>

      {!isExpanded && !isLive && summary.touchedNodeIds.length > 0 && (
        <NodePills nodeIds={summary.touchedNodeIds} />
      )}

      {isExpanded && (
        <ol className="relative mt-0.5 mb-1 ml-2.25 border-l border-slate-200 pl-3.5 animate-appear">
          {steps.map((step) => (
            <ActivityStepRow key={step.key} step={step} />
          ))}
        </ol>
      )}
    </div>
  );
});

function LiveHeader({
  step,
  toolCount,
}: {
  step: ActivityStep | undefined;
  toolCount: number;
}) {
  // « Thinking… » seulement quand il n'y a pas d'étiquette à montrer :
  // raisonnement en cours, ou aucun tool encore annoncé.
  const label =
    !step || step.kind === "reasoning" ? "Thinking…" : step.label;

  return (
    <>
      <span className="flex size-5 shrink-0 items-center justify-center">
        <TbLoader2 size={14} className="animate-spin text-slate-400" />
      </span>
      <span
        // La clé relance le fondu à chaque nouvelle étape, pas à chaque
        // token de l'étiquette en streaming.
        key={step?.key ?? "idle"}
        className="min-w-0 truncate text-shimmer animate-appear"
        title={label}
      >
        {label}
      </span>
      {toolCount > 1 && (
        <span className="shrink-0 text-xs text-slate-400 tabular-nums">
          · {toolCount} steps
        </span>
      )}
      <span className="flex-1" />
    </>
  );
}

function SummaryHeader({
  summary,
  steps,
}: {
  summary: ActivitySummary;
  steps: ActivityStep[];
}) {
  const icons =
    summary.icons.length > 0 ? summary.icons.slice(0, 3) : [REASONING_ICON];
  const stoppedCount = steps.filter((s) => s.status === "stopped").length;

  return (
    <>
      <span className="flex shrink-0 -space-x-1">
        {icons.map((Icon, i) => (
          <span
            key={i}
            className="flex size-5 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-2 ring-white"
          >
            <Icon size={11} />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate" title={summary.text}>
        {summary.text}
      </span>
      {summary.errorCount > 0 && (
        <span className="shrink-0 rounded-full bg-red-50 px-1.5 text-[11px] font-medium text-red-600">
          {summary.errorCount} failed
        </span>
      )}
      {stoppedCount > 0 && (
        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500">
          stopped
        </span>
      )}
    </>
  );
}

function NodePills({ nodeIds }: { nodeIds: string[] }) {
  const visible = nodeIds.slice(0, MAX_NODE_PILLS);
  const hidden = nodeIds.length - visible.length;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-7 animate-appear">
      {visible.map((id) => (
        <MentionedNodeCard key={id} nodeId={id} />
      ))}
      {hidden > 0 && (
        <span className="text-xs text-slate-400">+{hidden} more</span>
      )}
    </div>
  );
}

function findLast<T>(items: readonly T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) return items[i];
  }
  return undefined;
}
