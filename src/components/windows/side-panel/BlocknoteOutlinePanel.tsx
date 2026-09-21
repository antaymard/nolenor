import { cn } from "@/lib/utils";
import type { Heading } from "@/lib/blocknoteOutline";

/**
 * Renders a blocknote heading outline. Shared by the fullscreen tablet-portrait
 * popover (`FullscreenBlocknoteWindow`) and the window side panel's Plan tab —
 * one implementation instead of two drifting copies.
 */
export function BlocknoteOutlinePanel({
  headings,
  onSelect,
  className,
}: {
  headings: Heading[];
  onSelect: (heading: Heading) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Outline
      </div>
      <div className="flex-1 overflow-auto p-2">
        {headings.length === 0 ? (
          <div className="px-2 py-4 text-sm text-slate-400">
            Add headings to generate the outline.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {headings.map((heading) => (
              <li key={heading.id}>
                <button
                  type="button"
                  onClick={() => onSelect(heading)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900",
                    heading.depth === 1 && "font-semibold text-slate-700",
                    heading.depth === 2 && "pl-4",
                    heading.depth === 3 && "pl-6 text-slate-500",
                    heading.depth >= 4 && "pl-8 text-xs text-slate-500",
                  )}
                  title={heading.title}
                >
                  {heading.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
