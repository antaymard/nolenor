import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import type { FieldOptionsEditorProps } from "@/components/fields/fieldHostTypes";

export default function NumberOptionsEditor({
  field,
  onChange,
}: FieldOptionsEditorProps) {
  function setOption(key: "unit" | "min" | "max", raw: string) {
    const value =
      key === "unit"
        ? raw || undefined
        : raw === ""
          ? undefined
          : Number(raw);
    onChange({ options: { ...field.options, [key]: value } });
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="space-y-1">
        <Label className="text-xs">Unit</Label>
        <Input
          value={
            typeof field.options?.unit === "string" ? field.options.unit : ""
          }
          onChange={(e) => setOption("unit", e.target.value)}
          placeholder="kg, €…"
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Min</Label>
        <Input
          type="number"
          value={typeof field.options?.min === "number" ? field.options.min : ""}
          onChange={(e) => setOption("min", e.target.value)}
          className="h-8"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Max</Label>
        <Input
          type="number"
          value={typeof field.options?.max === "number" ? field.options.max : ""}
          onChange={(e) => setOption("max", e.target.value)}
          className="h-8"
        />
      </div>
    </div>
  );
}
