import { useMemo, useState } from "react";
import { TbCheck, TbX } from "react-icons/tb";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { Input } from "@/components/shadcn/input";
import { cn } from "@/lib/utils";
import {
  SELECT_COLOR_CLASSES,
  type SelectCellValue,
  type SelectOption,
} from "./types";

export interface SelectCellEditorProps {
  options: SelectOption[];
  isMulti: boolean;
  value: SelectCellValue | null | undefined;
  isEditing: boolean;
  readOnly?: boolean;
  onClick: () => void;
  onChange: (val: SelectCellValue) => void;
  onBlur: () => void;
  // Rendu de la valeur sélectionnée. "chips" (défaut) = pastilles colorées,
  // le rendu historique utilisé par les tables. "text" = libellés en texte
  // simple, pour le variant `select.text` des custom nodes. La liste
  // d'options du popover est identique dans les deux cas.
  displayMode?: "chips" | "text";
}

function normalizeValue(value: SelectCellValue | null | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

export function SelectCellChip({ option }: { option: SelectOption }) {
  const c = SELECT_COLOR_CLASSES[option.color];
  return (
    <span
      className={cn(
        "inline-flex items-center max-w-full rounded-md px-1.5 py-0.5 font-medium",
        c.bg,
        c.text,
      )}
    >
      <span className="truncate">{option.label}</span>
    </span>
  );
}

export function SelectCellEditor({
  options,
  isMulti,
  value,
  isEditing,
  readOnly,
  onClick,
  onChange,
  onBlur,
  displayMode = "chips",
}: SelectCellEditorProps) {
  const [search, setSearch] = useState("");
  const selectedIds = useMemo(() => normalizeValue(value), [value]);
  const optionsById = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );
  const selectedOptions = selectedIds
    .map((id) => optionsById.get(id))
    .filter((o): o is SelectOption => Boolean(o));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => o.label.toLowerCase().includes(term));
  }, [options, search]);

  function toggle(id: string) {
    if (isMulti) {
      if (selectedIds.includes(id)) {
        onChange(selectedIds.filter((x) => x !== id));
      } else {
        onChange([...selectedIds, id]);
      }
    } else {
      if (selectedIds[0] === id) {
        onChange([]);
      } else {
        onChange([id]);
      }
      onBlur();
    }
  }

  function removeOne(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    onChange(selectedIds.filter((x) => x !== id));
  }

  const displayContent =
    selectedOptions.length === 0 ? (
      <span className="text-muted-foreground">&nbsp;</span>
    ) : displayMode === "text" ? (
      <span className="truncate min-w-0">
        {selectedOptions.map((opt) => opt.label).join(", ")}
      </span>
    ) : (
      <span className="flex items-center gap-1 flex-wrap min-w-0">
        {selectedOptions.map((opt) => (
          <span
            key={opt.id}
            className={cn(
              "inline-flex items-center gap-0.5 max-w-full rounded-md px-1.5 py-0.5 font-medium",
              SELECT_COLOR_CLASSES[opt.color].bg,
              SELECT_COLOR_CLASSES[opt.color].text,
            )}
          >
            <span className="truncate">{opt.label}</span>
            {!readOnly && isEditing && (
              <button
                type="button"
                onClick={(e) => removeOne(opt.id, e)}
                className="opacity-60 hover:opacity-100"
              >
                <TbX size={11} />
              </button>
            )}
          </span>
        ))}
      </span>
    );

  if (readOnly) {
    return (
      <span className="flex items-center gap-1 w-full min-h-[1.4em] rounded px-1">
        {displayContent}
      </span>
    );
  }

  return (
    <Popover
      open={isEditing}
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
          onBlur();
        }
      }}
    >
      <PopoverTrigger asChild>
        <span
          className="flex items-center gap-1 w-full min-h-[1.4em] rounded px-1 cursor-pointer hover:bg-muted/50"
          onClick={onClick}
        >
          {displayContent}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2 border-b">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search options…"
            className="h-7"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 && (
            <p className="text-muted-foreground text-center py-3 px-2">
              No options yet. Configure them from the column menu.
            </p>
          )}
          {options.length > 0 && filtered.length === 0 && (
            <p className="text-muted-foreground text-center py-3 px-2">
              No matches.
            </p>
          )}
          {filtered.map((opt) => {
            const selected = selectedIds.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className={cn(
                  "flex items-center justify-between gap-2 w-full rounded-sm px-2 py-1 text-left hover:bg-muted",
                )}
              >
                <SelectCellChip option={opt} />
                {selected && (
                  <TbCheck size={14} className="text-foreground shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
