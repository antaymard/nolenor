import { memo, useState } from "react";
import { TbAlertCircle, TbChevronRight, TbLoader2 } from "react-icons/tb";
import { cn } from "@/lib/utils";
import type { ActivityStep } from "./activityModel";
import { ReasoningBody } from "./ReasoningBody";
import { ToolStepDetails } from "./ToolStepDetails";
import { getToolMeta, REASONING_ICON } from "./toolMeta";

/**
 * Une ligne de la timeline dépliée : icône du tool, étiquette, statut. Un clic
 * ouvre le détail — le texte pour un raisonnement, le tiroir de debug pour un
 * tool.
 */
export const ActivityStepRow = memo(function ActivityStepRow({
  step,
}: {
  step: ActivityStep;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const isReasoning = step.kind === "reasoning";
  const Icon = isReasoning ? REASONING_ICON : getToolMeta(step.name).icon;
  const isRunning = step.status === "running";
  const isError = step.status === "error";
  const label = isReasoning
    ? isRunning
      ? "Thinking…"
      : "Thought"
    : step.label;

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="group/step flex w-full min-w-0 items-center gap-2 rounded py-[3px] pr-1 text-left leading-5 transition-colors hover:text-slate-800"
      >
        {/* Le point posé sur le rail de la timeline. */}
        <span
          aria-hidden
          className={cn(
            "absolute top-[10.5px] -left-[17px] size-[5px] rounded-full ring-2 ring-white",
            isError
              ? "bg-red-400"
              : isRunning
                ? "animate-pulse bg-slate-500"
                : "bg-slate-300",
          )}
        />
        <Icon
          size={13}
          className={cn(
            "shrink-0",
            isError ? "text-red-500" : "text-slate-400",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            isError ? "text-red-700" : "text-slate-600",
            isRunning && "text-shimmer",
            step.status === "stopped" && "text-slate-400 line-through",
          )}
          title={label}
        >
          {label}
        </span>
        {isRunning && (
          <TbLoader2 size={12} className="shrink-0 animate-spin text-slate-400" />
        )}
        {isError && <TbAlertCircle size={13} className="shrink-0 text-red-500" />}
        <TbChevronRight
          size={12}
          className={cn(
            "shrink-0 text-slate-400 opacity-0 transition-[opacity,transform] group-hover/step:opacity-100",
            isOpen && "rotate-90 opacity-100",
          )}
        />
      </button>

      {isOpen &&
        (step.kind === "reasoning" ? (
          <div className="mt-0.5 mb-2 border-l-2 border-slate-100 pl-2.5 animate-appear">
            <ReasoningBody text={step.text} isStreaming={isRunning} />
          </div>
        ) : (
          <ToolStepDetails step={step} />
        ))}
    </li>
  );
});
