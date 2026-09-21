import type { ReactNode } from "react";
import { TbInfoCircle } from "react-icons/tb";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { cn } from "@/lib/utils";

/** A section header (Transcript, Backlinks, Connections, Threads…) with an
 * info icon explaining what it is on hover. */
export function SectionLabel({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500",
        className,
      )}
    >
      <span>{children}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600"
            aria-label={`About ${typeof children === "string" ? children : "this section"}`}
          >
            <TbInfoCircle size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 font-normal normal-case">
          {hint}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
