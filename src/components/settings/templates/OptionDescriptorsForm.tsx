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
import type { OptionFieldDescriptor } from "@/../convex/config/optionDescriptors";

// Formulaire dérivé d'une liste de descripteurs. Générique par construction :
// il ne connaît ni les variants, ni les types de champs — seulement les
// quatre formes de contrôle. Ajouter une option quelque part dans le
// catalogue ne demande donc jamais de toucher ici.

type OptionDescriptorsFormProps = {
  descriptors: OptionFieldDescriptor[];
  // Valeurs déjà résolues (défauts appliqués) pour les usages qui en
  // disposent, brutes pour les autres — le formulaire ne suppose rien.
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  title?: string;
};

export default function OptionDescriptorsForm({
  descriptors,
  values,
  onChange,
  title,
}: OptionDescriptorsFormProps) {
  if (descriptors.length === 0) return null;

  function set(key: string, next: unknown) {
    // On repart des valeurs affichées : sans ça, modifier une clé d'un objet
    // partiel écrirait un objet qui reste partiel, et le formulaire
    // afficherait un défaut que la donnée ne porte pas.
    onChange({ ...values, [key]: next });
  }

  return (
    <div
      data-slot="option-descriptors-form"
      className="space-y-2 rounded-md border border-gray-200 bg-white p-2"
    >
      {title && (
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
          {title}
        </p>
      )}

      {descriptors.map((descriptor) => {
        const current = values[descriptor.key];

        return (
          <div
            key={descriptor.key}
            className={
              descriptor.kind === "boolean"
                ? "flex items-center justify-between gap-2"
                : "space-y-1"
            }
          >
            <Label className="text-xs">{descriptor.label}</Label>

            {descriptor.kind === "boolean" && (
              <Switch
                checked={current === true}
                onCheckedChange={(checked) => set(descriptor.key, checked)}
              />
            )}

            {descriptor.kind === "number" && (
              <Input
                type="number"
                min={descriptor.min}
                max={descriptor.max}
                step={descriptor.integer ? 1 : undefined}
                value={typeof current === "number" ? current : ""}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  // Champ vidé : on ne réécrit rien, sinon la valeur
                  // deviendrait NaN le temps d'une frappe.
                  if (raw === "") return;
                  const next = Number(raw);
                  if (Number.isFinite(next)) set(descriptor.key, next);
                }}
                className="h-7"
              />
            )}

            {descriptor.kind === "text" && (
              <Input
                value={typeof current === "string" ? current : ""}
                placeholder={descriptor.placeholder}
                maxLength={descriptor.maxLength}
                onChange={(e) =>
                  set(descriptor.key, e.target.value || undefined)
                }
                className="h-7"
              />
            )}

            {descriptor.kind === "enum" && (
              <Select
                value={typeof current === "string" ? current : undefined}
                onValueChange={(next) => set(descriptor.key, next)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {descriptor.values.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {descriptor.help && (
              <p className="text-[11px] text-gray-400">{descriptor.help}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
