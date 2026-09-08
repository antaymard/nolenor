import {
  nodeTypeValues,
  type NodeType,
} from "@/../convex/schemas/nodeTypeSchema";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { cn } from "@/lib/utils";

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  link: "Links",
  image: "Images",
  blocknote: "Notes",
  value: "Values",
  embed: "Embeds",
  title: "Titles",
  pdf: "PDF",
  table: "Tables",
  app: "Apps",
  audio: "Audio",
  video: "Videos",
  viewport: "Viewports",
  custom: "Custom",
};

/**
 * Filter by node type. Deliberately chips instead of a `type:pdf` syntax:
 * it's the only filter the index can apply itself (`filterFields`),
 * so it makes sense to make it visible and clickable.
 */
export function SearchTypeFilter({
  selected,
  onToggle,
  onClear,
  className,
}: {
  selected: NodeType[];
  onToggle: (type: NodeType) => void;
  onClear: () => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by node type"
      className={cn(
        "flex flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {nodeTypeValues.map((type) => {
        const Icon = getNodeIcon(type);
        const active = selected.includes(type);
        return (
          <button
            key={type}
            type="button"
            aria-pressed={active}
            // Keep focus in the input: keyboard navigation depends on it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onToggle(type)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              active
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {Icon ? <Icon size={12} className="shrink-0" /> : null}
            {NODE_TYPE_LABELS[type]}
          </button>
        );
      })}
      {selected.length > 0 ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClear}
          className="shrink-0 px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Show all
        </button>
      ) : null}
    </div>
  );
}
