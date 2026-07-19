import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FieldRenderProps } from "@/components/fields/registry/fieldRegistry";

// Texte court : span cliquable → input inline (blur/Enter commit, Esc
// cancel), même pattern que les cellules texte des tables.
export default function ShortTextField({
  field,
  value,
  onCommit,
}: FieldRenderProps) {
  const text = typeof value === "string" ? value : "";
  const [editing, setEditing] = useState(false);

  const placeholder =
    typeof field.options?.placeholder === "string" &&
    field.options.placeholder.length > 0
      ? field.options.placeholder
      : field.name;

  if (editing && onCommit) {
    return (
      <input
        autoFocus
        type="text"
        defaultValue={text}
        placeholder={placeholder}
        className="nodrag w-full min-w-0 bg-transparent border-b border-blue-300 outline-none text-sm py-0.5"
        onBlur={(e) => {
          if (e.target.value !== text) onCommit(e.target.value);
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
        "nodrag block w-full min-w-0 truncate text-sm rounded px-0.5 py-0.5",
        onCommit && "cursor-text hover:bg-black/5",
        !text && "text-muted-foreground/60 italic",
      )}
      onClick={(e) => {
        if (!onCommit) return;
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {text || placeholder}
    </span>
  );
}
