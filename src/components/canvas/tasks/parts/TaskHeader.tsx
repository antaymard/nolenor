import type { ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { X } from "lucide-react";
import {
  TbAlertCircle,
  TbAlertTriangle,
  TbCheck,
  TbMessageQuestion,
} from "react-icons/tb";
import type { ResolvedRunStatus } from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";

/**
 * L'en-tête d'une carte de tâche : l'état, la demande, la durée — et la croix
 * qui vient la remplacer au survol.
 */
export function TaskHeader({
  status,
  request,
  context,
  duration,
  onDismiss,
}: {
  status: ResolvedRunStatus;
  /** Ce que l'utilisateur a demandé. */
  request: string;
  /** Le sujet (titre du thread), au survol. */
  context?: string | null;
  duration: string | null;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <TaskStatusIndicator status={status} />
      <span
        className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800"
        title={context ? `In “${context}”` : undefined}
      >
        {request}
      </span>
      <span className="relative flex min-w-9 shrink-0 items-center justify-end">
        <span
          className={cn(
            "text-[10px] tabular-nums text-slate-400 transition-opacity",
            onDismiss && "group-hover:opacity-0",
          )}
        >
          {duration}
        </span>
        {onDismiss ? (
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss();
            }}
            className="absolute -right-0.5 flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10"
          >
            <X size={12} />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * L'état, à la place qu'occupe l'orbe dans la conversation. L'orbe n'est
 * montée que pendant le run : c'est une animation, elle n'a rien à faire sur
 * une tâche conclue qui peut rester des heures.
 */
export function TaskStatusIndicator({ status }: { status: ResolvedRunStatus }) {
  if (status === "running") {
    return (
      <ThinkingOrb state="solving" size={20} aria-hidden className="shrink-0" />
    );
  }
  return (
    <IndicatorSlot>
      {status === "waiting" ? (
        <TbMessageQuestion size={16} className="text-violet-600" />
      ) : status === "error" ? (
        <TbAlertCircle size={16} className="text-red-500" />
      ) : status === "stale" || status === "aborted" ? (
        <TbAlertTriangle size={15} className="text-amber-500" />
      ) : (
        <TbCheck size={16} className="text-emerald-600" />
      )}
    </IndicatorSlot>
  );
}

/** Même empreinte que l'orbe, pour que rien ne bouge quand la tâche se conclut. */
function IndicatorSlot({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}
