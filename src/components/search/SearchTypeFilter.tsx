import {
  nodeTypeValues,
  type NodeType,
} from "@/../convex/schemas/nodeTypeSchema";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { cn } from "@/lib/utils";

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  link: "Liens",
  image: "Images",
  blocknote: "Notes",
  value: "Valeurs",
  embed: "Embeds",
  title: "Titres",
  pdf: "PDF",
  table: "Tableaux",
  app: "Apps",
  audio: "Audio",
  custom: "Custom",
};

/**
 * Filtre par type de node. Volontairement en chips plutôt qu'en syntaxe
 * `type:pdf` : c'est le seul filtre que l'index sait appliquer lui-même
 * (`filterFields`), donc autant le rendre visible et cliquable.
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
      aria-label="Filtrer par type de node"
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
            // Garder le focus dans le champ : la navigation clavier en dépend.
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
          Tout afficher
        </button>
      ) : null}
    </div>
  );
}
