import { useRef, useState } from "react";
import type { Column } from "@tanstack/react-table";
import { TbArrowDown, TbArrowUp } from "react-icons/tb";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";
import { ColumnMenu } from "./ColumnMenu";
import { COLUMN_TYPE_CONFIG } from "./types";
import type { ColumnType, TableColumn, TableRowData } from "./types";

export interface ColHeaderProps {
  col: TableColumn;
  tanstackCol: Column<TableRowData, unknown>;
  readOnly?: boolean;
  /** La poignée de drag, posée à la place de l'icône de type au survol. */
  dragHandle?: React.ReactNode;
  lossyCountFor: (type: ColumnType) => number;
  onNameChange: (name: string) => void;
  onTypeChange: (type: ColumnType) => void;
  onDelete: () => void;
  onEditOptions?: () => void;
}

/**
 * En-tête d'une colonne.
 *
 * Deux changements par rapport à l'ancienne version :
 *
 * - l'icône du type est affichée en permanence, donc on sait ce que contient
 *   une colonne sans ouvrir quoi que ce soit ;
 * - tout l'en-tête ouvre le menu, dont le champ de nom est le premier élément.
 *   Avant, renommer supposait de deviner que le texte était cliquable, et le
 *   menu — la seule affordance visible — ne proposait pas de renommer.
 *
 * Le double-clic garde un renommage inline direct, pour qui connaît déjà le
 * geste.
 */
export function ColHeader({
  col,
  tanstackCol,
  readOnly,
  dragHandle,
  lossyCountFor,
  onNameChange,
  onTypeChange,
  onDelete,
  onEditOptions,
}: ColHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [inlineEditing, setInlineEditing] = useState(false);
  // Un double-clic émet aussi deux clics : sans ce drapeau, le menu s'ouvrirait
  // derrière le champ de renommage inline.
  const skipNextClickRef = useRef(false);

  const sorted = tanstackCol.getIsSorted();
  const Icon = COLUMN_TYPE_CONFIG[col.type].icon;

  if (inlineEditing) {
    return (
      <Input
        autoFocus
        defaultValue={col.name}
        className="h-6 w-full min-w-0 px-1 text-xs"
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next && next !== col.name) onNameChange(next);
          setInlineEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = col.name;
            e.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group/colheader flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left",
            !readOnly && "hover:bg-muted/60",
          )}
          onClick={(e) => {
            if (skipNextClickRef.current) {
              skipNextClickRef.current = false;
              e.preventDefault();
            }
          }}
          onDoubleClick={(e) => {
            if (readOnly) return;
            e.preventDefault();
            skipNextClickRef.current = true;
            setMenuOpen(false);
            setInlineEditing(true);
          }}
        >
          <span className="relative size-[13px] shrink-0">
            <Icon
              size={13}
              className={cn(
                "absolute inset-0 text-muted-foreground",
                dragHandle && "group-hover/head:opacity-0",
              )}
            />
            {dragHandle}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{col.name}</span>
          {sorted === "asc" && <TbArrowUp size={12} className="shrink-0" />}
          {sorted === "desc" && <TbArrowDown size={12} className="shrink-0" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <ColumnMenu
          col={col}
          tanstackCol={tanstackCol}
          readOnly={readOnly}
          lossyCountFor={lossyCountFor}
          onNameChange={onNameChange}
          onTypeChange={onTypeChange}
          onDelete={onDelete}
          onEditOptions={onEditOptions}
          onClose={() => setMenuOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
