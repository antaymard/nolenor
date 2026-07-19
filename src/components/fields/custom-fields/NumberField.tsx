import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FieldRenderProps } from "@/components/fields/registry/fieldRegistry";

export default function NumberField({
  field,
  value,
  onCommit,
}: FieldRenderProps) {
  const num = typeof value === "number" ? value : undefined;
  const [editing, setEditing] = useState(false);

  const unit =
    typeof field.options?.unit === "string" && field.options.unit.length > 0
      ? field.options.unit
      : undefined;

  if (editing && onCommit) {
    return (
      <input
        autoFocus
        type="number"
        defaultValue={num ?? ""}
        className="nodrag w-full min-w-0 bg-transparent border-b border-blue-300 outline-none text-sm py-0.5"
        onBlur={(e) => {
          const raw = e.target.value.trim();
          // Champ vidé = valeur effacée (la clé est retirée des values).
          const next = raw === "" ? undefined : Number(raw);
          if (next === undefined || Number.isFinite(next)) {
            if (next !== num) onCommit(next);
          }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className={cn(
        "nodrag block w-full min-w-0 truncate text-sm tabular-nums rounded px-0.5 py-0.5",
        onCommit && "cursor-text hover:bg-black/5",
        num === undefined && "text-muted-foreground/60 italic",
      )}
      onClick={(e) => {
        if (!onCommit) return;
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {num !== undefined ? (unit ? `${num} ${unit}` : String(num)) : field.name}
    </span>
  );
}
