import { cn } from "@/lib/utils";
import type { OutlineEntry } from "@/lib/pdfOutline";

/**
 * Renders a PDF page/section outline. Shared by the fullscreen tablet-portrait
 * popover (`FullscreenPdfWindow`) and the window side panel's Plan tab.
 */
export function PdfOutlinePanel({
  entries,
  onSelect,
  className,
}: {
  entries: OutlineEntry[];
  onSelect: (pageIndex: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Outline
      </div>
      <div className="flex-1 overflow-auto p-2">
        {entries.length === 0 ? (
          <div className="px-2 py-4 text-sm text-slate-400">
            No outline available.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {entries.map((entry, index) => (
              <li key={`${entry.pageIndex}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.pageIndex)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-sm text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900",
                    entry.level === 1 && "font-semibold text-slate-700",
                    entry.level === 2 && "pl-4",
                    entry.level === 3 && "pl-6 text-slate-500",
                    entry.level >= 4 && "pl-8 text-xs text-slate-500",
                  )}
                  title={entry.title}
                >
                  {entry.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
