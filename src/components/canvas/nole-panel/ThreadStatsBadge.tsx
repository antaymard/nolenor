import { TbDatabase } from "react-icons/tb";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { useThreadStats } from "@/hooks/useThreadStats";
import { getModelLabel } from "@/lib/getModelLabel";
import { formatCost, formatTokens } from "@/lib/formatUsage";
import { cn } from "@/lib/utils";
import type { ChatModelOption } from "@/types/convex";

type ThreadStatsBadgeProps = {
  threadId: string | null | undefined;
  selectedModel: string | undefined;
  modelOptions: readonly ChatModelOption[] | undefined;
};

// Géométrie de l'anneau. Le rayon est calculé depuis la taille et l'épaisseur
// pour que le trait reste entièrement dans la boîte, sans rognage aux bords.
const RING_SIZE = 15;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Seuils à partir desquels la fenêtre de contexte devient un sujet. */
const CONTEXT_WARN_PERCENT = 75;
const CONTEXT_DANGER_PERCENT = 90;

function getRingColorClass(percent: number): string {
  if (percent >= CONTEXT_DANGER_PERCENT) return "text-red-500";
  if (percent >= CONTEXT_WARN_PERCENT) return "text-amber-500";
  return "text-slate-400";
}

/**
 * Occupation de la fenêtre de contexte du thread, en anneau de progression.
 *
 * La forme porte l'information en continu — on voit le thread se remplir sans
 * lire un chiffre — et libère la place que le pourcentage et le coût
 * occupaient dans le header, désormais tenue par la pastille de statut. Le
 * détail chiffré, coût compris, passe au survol.
 */
export default function ThreadStatsBadge({
  threadId,
  selectedModel,
  modelOptions,
}: ThreadStatsBadgeProps) {
  const stats = useThreadStats({ threadId, selectedModel, modelOptions });

  if (stats.isLoading || stats.contextWindowUsed === 0) return null;

  const percent = stats.contextPercent;
  const clampedPercent =
    percent !== undefined ? Math.min(100, Math.max(0, percent)) : undefined;
  const percentLabel =
    percent !== undefined
      ? `${percent < 1 ? percent.toFixed(1) : Math.round(percent)}%`
      : null;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          className="inline-flex shrink-0 cursor-default items-center rounded-sm p-1 hover:bg-slate-100"
          aria-label={
            percentLabel
              ? `Contexte utilisé : ${percentLabel}`
              : "Usage du thread"
          }
        >
          {clampedPercent !== undefined ? (
            <ContextRing percent={clampedPercent} />
          ) : (
            // Fenêtre de contexte inconnue (modèle hors catalogue) : il n'y a
            // pas de fraction à dessiner, mais l'usage reste consultable.
            <TbDatabase size={11} className="text-slate-400" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
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
          <p className="mt-1 text-slate-300">
            Contexte actuel : {formatTokens(stats.contextWindowUsed)} tk
            {stats.maxContext ? ` / ${formatTokens(stats.maxContext)} tk` : ""}
            {percentLabel ? ` (${percentLabel})` : ""}
          </p>
          {stats.totalCostUsd > 0 ? (
            <p className="text-slate-300">
              Coût : {formatCost(stats.totalCostUsd)}
            </p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ContextRing({ percent }: { percent: number }) {
  const center = RING_SIZE / 2;

  return (
    <svg
      width={RING_SIZE}
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      className={cn("shrink-0", getRingColorClass(percent))}
      aria-hidden
    >
      <circle
        cx={center}
        cy={center}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        className="stroke-slate-200"
      />
      <circle
        cx={center}
        cy={center}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        stroke="currentColor"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
        // Départ à midi plutôt qu'à trois heures, sens horaire.
        transform={`rotate(-90 ${center} ${center})`}
        className="transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}
