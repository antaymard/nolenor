import { useState } from "react";
import { TbArrowDown, TbArrowUp, TbPlus, TbTrash } from "react-icons/tb";
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
} from "@/components/table/types";
import type { SelectChoice } from "@/../convex/config/fieldConfig";
import { genId } from "./templateDraft";

// Éditeur inline des options d'un champ select (adapté du
// SelectOptionsDialog des tables, sans le Dialog : le builder édite un
// draft local, la sauvegarde passe par le Save global du template).

function toSelectColor(color: string | undefined): SelectColor {
  return color && color in SELECT_COLOR_CLASSES
    ? (color as SelectColor)
    : "gray";
}

function pickNextColor(existing: SelectChoice[]): SelectColor {
  const used = new Set(existing.map((o) => o.color));
  for (const c of SELECT_COLOR_PALETTE) {
    if (!used.has(c)) return c;
  }
  return SELECT_COLOR_PALETTE[existing.length % SELECT_COLOR_PALETTE.length];
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
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full",
              SELECT_COLOR_CLASSES[color].swatch,
            )}
          />
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

type SelectOptionsEditorProps = {
  choices: SelectChoice[];
  isMulti: boolean;
  onChange: (choices: SelectChoice[], isMulti: boolean) => void;
};

export default function SelectOptionsEditor({
  choices,
  isMulti,
  onChange,
}: SelectOptionsEditorProps) {
  function updateChoice(id: string, patch: Partial<SelectChoice>) {
    onChange(
      choices.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      isMulti,
    );
  }

  function moveChoice(id: string, direction: -1 | 1) {
    const idx = choices.findIndex((c) => c.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= choices.length) return;
    const next = [...choices];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    onChange(next, isMulti);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Allow multiple values</Label>
        <Switch
          checked={isMulti}
          onCheckedChange={(checked) => onChange(choices, checked)}
        />
      </div>

      <div className="space-y-1.5">
        {choices.map((choice, idx) => (
          <div key={choice.id} className="flex items-center gap-1">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => moveChoice(choice.id, -1)}
                disabled={idx === 0}
                className="text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-30"
              >
                <TbArrowUp size={11} />
              </button>
              <button
                type="button"
                onClick={() => moveChoice(choice.id, 1)}
                disabled={idx === choices.length - 1}
                className="text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-30"
              >
                <TbArrowDown size={11} />
              </button>
            </div>
            <ColorPicker
              color={toSelectColor(choice.color)}
              onChange={(c) => updateChoice(choice.id, { color: c })}
            />
            <Input
              value={choice.label}
              onChange={(e) => updateChoice(choice.id, { label: e.target.value })}
              placeholder="Option label"
              className="h-7 flex-1 text-sm"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() =>
                onChange(
                  choices.filter((c) => c.id !== choice.id),
                  isMulti,
                )
              }
              disabled={choices.length <= 1}
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              title={
                choices.length <= 1
                  ? "A select field needs at least one option"
                  : "Delete option (existing values keep the id and render as unknown)"
              }
            >
              <TbTrash size={13} />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full h-7"
        onClick={() =>
          onChange(
            [
              ...choices,
              {
                id: genId("opt"),
                label: `Option ${choices.length + 1}`,
                color: pickNextColor(choices),
              },
            ],
            isMulti,
          )
        }
      >
        <TbPlus size={13} className="mr-1" />
        Add option
      </Button>
    </div>
  );
}
