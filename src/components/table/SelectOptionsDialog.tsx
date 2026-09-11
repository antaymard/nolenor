import { useEffect, useState } from "react";
import { TbGripVertical, TbPlus, TbTrash } from "react-icons/tb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Switch } from "@/components/shadcn/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { cn } from "@/lib/utils";
import {
  SELECT_COLOR_CLASSES,
  SELECT_COLOR_PALETTE,
  type SelectColor,
  type SelectOption,
} from "./types";

export interface SelectOptionsDialogProps {
  open: boolean;
  columnName: string;
  options: SelectOption[];
  isMulti: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (options: SelectOption[], isMulti: boolean) => void;
}

function ColorSwatch({ color }: { color: SelectColor }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 rounded-full",
        SELECT_COLOR_CLASSES[color].swatch,
      )}
    />
  );
}

function ColorPicker({
  color,
  onChange,
}: {
  color: SelectColor;
  onChange: (c: SelectColor) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
        >
          <ColorSwatch color={color} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-6 gap-1">
          {SELECT_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center hover:ring-2 hover:ring-offset-1",
                c === color && "ring-2 ring-offset-1",
                SELECT_COLOR_CLASSES[c].ring,
              )}
              title={c}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-full",
                  SELECT_COLOR_CLASSES[c].swatch,
                )}
              />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function pickNextColor(existing: SelectOption[]): SelectColor {
  const used = new Set(existing.map((o) => o.color));
  for (const c of SELECT_COLOR_PALETTE) {
    if (!used.has(c)) return c;
  }
  return SELECT_COLOR_PALETTE[
    existing.length % SELECT_COLOR_PALETTE.length
  ] as SelectColor;
}

export function SelectOptionsDialog({
  open,
  columnName,
  options,
  isMulti,
  onOpenChange,
  onSave,
}: SelectOptionsDialogProps) {
  const [draftOptions, setDraftOptions] = useState<SelectOption[]>(options);
  const [draftIsMulti, setDraftIsMulti] = useState<boolean>(isMulti);

  useEffect(() => {
    if (open) {
      setDraftOptions(options);
      setDraftIsMulti(isMulti);
    }
  }, [open, options, isMulti]);

  function addOption() {
    const newOpt: SelectOption = {
      id: crypto.randomUUID(),
      label: "",
      color: pickNextColor(draftOptions),
    };
    setDraftOptions((prev) => [...prev, newOpt]);
  }

  function updateOption(id: string, patch: Partial<SelectOption>) {
    setDraftOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    );
  }

  function removeOption(id: string) {
    setDraftOptions((prev) => prev.filter((o) => o.id !== id));
  }

  function moveOption(id: string, direction: -1 | 1) {
    setDraftOptions((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function handleSave() {
    const cleaned = draftOptions
      .map((o) => ({ ...o, label: o.label.trim() }))
      .filter((o) => o.label.length > 0);
    onSave(cleaned, draftIsMulti);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit options — {columnName}</DialogTitle>
          <DialogDescription>
            Define the options available for this column. Options are scoped to
            this table only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="multi-select-toggle">Allow multiple values</Label>
            <p className="text-muted-foreground">
              Cells can hold one or several options.
            </p>
          </div>
          <Switch
            id="multi-select-toggle"
            checked={draftIsMulti}
            onCheckedChange={setDraftIsMulti}
          />
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {draftOptions.length === 0 && (
            <p className="text-muted-foreground text-center py-4">
              No options yet.
            </p>
          )}
          {draftOptions.map((opt, idx) => (
            <div key={opt.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => moveOption(opt.id, -1)}
                disabled={idx === 0}
                className="text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-30 cursor-grab"
                title="Move up"
              >
                <TbGripVertical size={14} />
              </button>
              <ColorPicker
                color={opt.color}
                onChange={(c) => updateOption(opt.id, { color: c })}
              />
              <Input
                value={opt.label}
                onChange={(e) =>
                  updateOption(opt.id, { label: e.target.value })
                }
                placeholder="Option label"
                className="h-8 flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeOption(opt.id)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
              >
                <TbTrash size={14} />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addOption}
          className="w-full"
        >
          <TbPlus size={14} className="mr-1" />
          Add option
        </Button>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
