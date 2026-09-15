import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { cn } from "@/lib/utils";
import type { SearchMode } from "./useSearch";

const LABELS: Record<
  SearchMode,
  { full: string; short: string; hint: string }
> = {
  keyword: { full: "Keyword", short: "Key", hint: "Keyword search" },
  auto: { full: "Auto", short: "Auto", hint: "Hybrid search" },
  semantic: { full: "Semantic", short: "Sem", hint: "Semantic search" },
};

const MODES: SearchMode[] = ["keyword", "auto", "semantic"];

/** Sélecteur Keyword / Auto / Semantic, partagé modale desktop et mobile. */
export function SearchModeToggle({
  value,
  onChange,
  compact = false,
  className,
}: {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      onValueChange={(next) => {
        if (next === "keyword" || next === "auto" || next === "semantic")
          onChange(next);
      }}
      aria-label="Search mode"
      className={cn("shrink-0", className)}
    >
      {MODES.map((mode) => (
        <ToggleGroupItem
          key={mode}
          value={mode}
          aria-label={LABELS[mode].hint}
          className="text-xs"
        >
          {compact ? LABELS[mode].short : LABELS[mode].full}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Bandeau affiché quand la branche sémantique est tombée (repli keyword). */
export function SearchDegradedNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-md border border-amber-500/40 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
        className,
      )}
    >
      Semantic search unavailable — showing keyword results only.
    </div>
  );
}
