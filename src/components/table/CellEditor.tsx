import { Checkbox } from "@/components/shadcn/checkbox";
import { Input } from "@/components/shadcn/input";
import { Calendar } from "@/components/shadcn/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { TbCalendar } from "react-icons/tb";
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
    const dateValue =
      value != null && value !== "" ? new Date(String(value)) : undefined;
    const displayValue =
      dateValue != null
        ? dateValue.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "";
    return (
      <Popover open={isEditing} onOpenChange={(open) => !open && onBlur()}>
        <PopoverTrigger asChild>
          <span
            className="flex items-center gap-1 w-full min-h-[1.4em] rounded px-1 cursor-pointer hover:bg-muted/50"
            onClick={onClick}
          >
            <TbCalendar size={13} className="shrink-0 text-muted-foreground" />
            {displayValue || (
              <span className="text-muted-foreground">Pick a date…</span>
            )}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={(date) => {
              if (date) {
                const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                onChange(iso);
              } else {
                onChange(null);
              }
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
            onChange(e.target.value !== "" ? Number(e.target.value) : null);
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
