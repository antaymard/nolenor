import { useMemo } from "react";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Switch } from "@/components/shadcn/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  parseVariantOptions,
  type FieldVariantDef,
} from "@/../convex/config/fieldVariants";
import { describeVariantOptions } from "./variantOptionsSchema";

// Formulaire des `variantOptions` du variant sélectionné, dérivé de son
// optionsSchema. Les valeurs affichées passent par parseVariantOptions :
// l'utilisateur voit donc les défauts effectifs, pas des champs vides qui
// suggéreraient faussement « non configuré ».
export default function VariantOptionsForm({
  variant,
  value,
  onChange,
}: {
  variant: FieldVariantDef;
  value: Record<string, unknown> | undefined;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const descriptors = useMemo(
    () =>
      variant.optionsSchema ? describeVariantOptions(variant.optionsSchema) : [],
    [variant.optionsSchema],
  );

  const resolved = useMemo(
    () => parseVariantOptions(variant, value) ?? {},
    [variant, value],
  );

  if (descriptors.length === 0) return null;

  function set(key: string, next: unknown) {
    // On repart des options résolues (défauts inclus) : sans ça, modifier une
    // clé d'un objet partiel écrirait un objet qui reste partiel, et le
    // formulaire afficherait un défaut que la donnée ne porte pas.
    onChange({ ...resolved, [key]: next });
  }

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white p-2">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        {variant.label} options
      </p>

      {descriptors.map((descriptor) => {
        const current = resolved[descriptor.key];

        if (descriptor.kind === "boolean") {
          return (
            <div
              key={descriptor.key}
              className="flex items-center justify-between"
            >
              <Label className="text-xs">{descriptor.label}</Label>
              <Switch
                checked={current === true}
                onCheckedChange={(checked) => set(descriptor.key, checked)}
              />
            </div>
          );
        }

        if (descriptor.kind === "number") {
          return (
            <div key={descriptor.key} className="space-y-1">
              <Label className="text-xs">{descriptor.label}</Label>
              <Input
                type="number"
                value={typeof current === "number" ? current : ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === "") return;
                  const next = Number(raw);
                  if (Number.isFinite(next)) set(descriptor.key, next);
                }}
                className="h-7"
              />
            </div>
          );
        }

        return (
          <div key={descriptor.key} className="space-y-1">
            <Label className="text-xs">{descriptor.label}</Label>
            <Select
              value={typeof current === "string" ? current : undefined}
              onValueChange={(next) => set(descriptor.key, next)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {descriptor.values.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
