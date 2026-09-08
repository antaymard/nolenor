import { Checkbox } from "@/components/shadcn/checkbox";
import { Input } from "@/components/shadcn/input";
import { Calendar } from "@/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { TbCalendar } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { formatAbsoluteDate, parseIsoDate, toIsoDate } from "@/lib/isoDate";
import { CellDisplay } from "./CellDisplay";
import { LinkCellEditor } from "./LinkCellEditor";
import { NodeCellEditor } from "./NodeCellEditor";
import { RichTextCellEditor } from "./RichTextCellEditor";
import { SelectCellEditor } from "./SelectCellEditor";
import { TextCellEditor } from "./TextCellEditor";
import { DEFAULT_ROW_HEIGHT } from "./types";
import type {
  ColumnType,
  CellValue,
  LinkCellValue,
  NodeCellValue,
  RowHeight,
  SelectCellValue,
  SelectOption,
} from "./types";

export interface CellEditorProps {
  type: ColumnType;
  value: CellValue | undefined;
  isEditing: boolean;
  readOnly: boolean;
  onClick: () => void;
  onChange: (val: CellValue) => void;
  onBlur: () => void;
  options?: SelectOption[];
  isMulti?: boolean;
  rowHeight?: RowHeight;
}

export function CellEditor({
  type,
  value,
  isEditing,
  readOnly,
  onClick,
  onChange,
  onBlur,
  options,
  isMulti,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: CellEditorProps) {
  if (readOnly) {
    if (type === "checkbox") {
      return <Checkbox checked={!!value} disabled className="block" />;
    }
    return (
      <CellDisplay
        type={type}
        value={value}
        options={options}
        rowHeight={rowHeight}
      />
    );
  }

  if (type === "checkbox") {
    return (
      <Checkbox
        checked={!!value}
        onCheckedChange={(checked) => onChange(!!checked)}
        className="block"
      />
    );
  }

  if (type === "date") {
    // Les trois helpers de `lib/isoDate` travaillent sur les composantes LOCALES
    // d'une date ISO nue. `new Date("2024-03-05")` est spec'é UTC : lire puis
    // réécrire reculait la date d'un jour à l'ouest de Greenwich.
    const dateValue = parseIsoDate(value);
    const displayValue = formatAbsoluteDate(value) ?? "";
    return (
      <Popover open={isEditing} onOpenChange={(open) => !open && onBlur()}>
        <PopoverTrigger asChild>
          <span
            // Une date est un jeton unique : elle ne revient jamais à la ligne,
            // quelle que soit la hauteur de ligne.
            className="flex min-w-0 w-full cursor-pointer items-center gap-1 min-h-[1.4em] overflow-hidden rounded px-1 whitespace-nowrap hover:bg-muted/50"
            onClick={onClick}
          >
            <TbCalendar size={13} className="shrink-0 text-muted-foreground" />
            <span
              className={cn("truncate", !displayValue && "text-muted-foreground")}
            >
              {displayValue || "Pick a date…"}
            </span>
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={(date) => {
              onChange(date ? toIsoDate(date) : null);
              onBlur();
            }}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (type === "link") {
    return (
      <LinkCellEditor
        value={value as LinkCellValue | null | undefined}
        isEditing={isEditing}
        onClick={onClick}
        onChange={onChange}
        onBlur={onBlur}
      />
    );
  }

  if (type === "node") {
    return (
      <NodeCellEditor
        value={value as NodeCellValue | null | undefined}
        isEditing={isEditing}
        readOnly={readOnly}
        onClick={onClick}
        onChange={onChange}
        onBlur={onBlur}
      />
    );
  }

  if (type === "richtext") {
    return (
      <RichTextCellEditor
        value={value}
        isEditing={isEditing}
        rowHeight={rowHeight}
        onClick={onClick}
        onChange={onChange}
        onBlur={onBlur}
      />
    );
  }

  if (type === "select") {
    return (
      <SelectCellEditor
        options={options ?? []}
        isMulti={!!isMulti}
        value={value as SelectCellValue | null | undefined}
        isEditing={isEditing}
        readOnly={readOnly}
        rowHeight={rowHeight}
        onClick={onClick}
        onChange={onChange}
        onBlur={onBlur}
      />
    );
  }

  if (type === "number") {
    if (isEditing) {
      return (
        <Input
          autoFocus
          type="number"
          defaultValue={value != null ? String(value) : ""}
          className="h-7"
          onBlur={(e) => {
            // `<input type="number">` rend une chaîne vide pour un contenu que
            // le navigateur juge invalide (« 1e », « 1-2 ») : publier ça
            // effaçait la cellule. On ne publie que si la valeur a changé, sinon
            // entrer puis sortir d'une cellule suffisait à marquer la fenêtre
            // comme modifiée.
            const raw = e.target.value;
            const next = raw !== "" ? Number(raw) : null;
            const isBrowserInvalid = raw === "" && !e.target.validity.valid;
            if (!isBrowserInvalid && next !== (value ?? null)) onChange(next);
            onBlur();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") onBlur();
          }}
        />
      );
    }
    return (
      <span
        className="block w-full min-h-[1.4em] truncate rounded px-1 cursor-text hover:bg-muted/50"
        onClick={onClick}
      >
        {value != null ? String(value) : ""}
      </span>
    );
  }

  return (
    <TextCellEditor
      value={value != null ? String(value) : ""}
      isEditing={isEditing}
      rowHeight={rowHeight}
      onClick={onClick}
      onChange={onChange}
      onBlur={onBlur}
    />
  );
}
