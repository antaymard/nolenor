import { TbCheck, TbSparkles } from "react-icons/tb";
import { getToolMeta } from "@/components/canvas/nole-panel/message/activity/toolMeta";
import { isLiveAccess } from "@/lib/noleLiveActivity";
import { cn } from "@/lib/utils";
import type { NoleNodeActivity } from "@/stores/noleLiveStore";

/**
 * Ce que Nolë fait (ou vient de faire) sur un node, en bille posée sur son
 * coin : l'icône du tool, la même que dans le chat (cf. `toolMeta`).
 *
 * - en cours : bille pleine, anneau qui tourne autour ;
 * - fini : bille claire, une coche qui apparaît en rebond ;
 * - au survol : la bille se déplie en pastille, avec l'explication du modèle
 *   (ou le libellé du tool) et l'état.
 */
export default function NoleActivityBead({
  activity,
}: {
  activity: NoleNodeActivity;
}) {
  const live = isLiveAccess(activity.access);
  const meta = activity.toolName ? getToolMeta(activity.toolName) : null;
  // Un node écrit sans appel connu (créé par le run) : l'icône de Nolë.
  const Icon = meta?.icon ?? TbSparkles;
  const label = activity.label ?? meta?.label ?? "Edited by Nolë";
  const status = live
    ? activity.access === "write"
      ? "Writing…"
      : "Reading…"
    : "Done";

  return (
    <div
      className={cn(
        "group/bead absolute -top-3.5 left-3 z-20 flex max-w-[min(280px,calc(100%-1.5rem))] items-center rounded-full p-[3px] shadow-sm",
        "animate-appear-zoom transition-[opacity,background-color,box-shadow] duration-500",
        live
          ? "bg-violet-600 shadow-[0_2px_10px_rgba(124,58,237,0.35)]"
          : "bg-white ring-1 ring-violet-200",
        activity.leaving && "opacity-0",
      )}
      title={`${label} · ${status}`}
    >
      <span
        className={cn(
          "relative grid size-[18px] shrink-0 place-items-center rounded-full transition-colors duration-500",
          live ? "text-white" : "bg-violet-50 text-violet-600",
        )}
      >
        <Icon size={12} />
        {live && (
          <span
            aria-hidden
            className="absolute -inset-[3px] animate-spin rounded-full border-[1.5px] border-white/80 border-t-transparent border-l-transparent"
          />
        )}
        {!live && (
          <span
            aria-hidden
            className="absolute -right-1 -bottom-1 grid size-2.5 animate-bead-pop place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white"
          >
            <TbCheck size={7} strokeWidth={4} />
          </span>
        )}
      </span>

      {/* Le détail, replié en largeur nulle hors survol. */}
      <span
        className={cn(
          "flex min-w-0 max-w-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap opacity-0",
          "transition-[max-width,opacity,padding] duration-300 ease-out",
          "group-hover/bead:max-w-[260px] group-hover/bead:pr-2 group-hover/bead:pl-1.5 group-hover/bead:opacity-100",
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate text-[11px] font-medium",
            live ? "text-white" : "text-slate-700",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 text-[10px]",
            live ? "text-violet-200" : "text-emerald-600",
          )}
        >
          {status}
        </span>
      </span>
    </div>
  );
}
