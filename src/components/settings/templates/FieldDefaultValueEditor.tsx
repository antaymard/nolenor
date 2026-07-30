import { Label } from "@/components/shadcn/label";
import FieldHost from "@/components/fields/FieldHost";
import type { TemplateField } from "@/../convex/config/fieldConfig";

// Saisie de la valeur par défaut d'un champ, sans une ligne d'UI par type :
// on monte le champ LUI-MÊME via FieldHost, avec un placement synthétique.
// Toute la répartition shell/registry est réutilisée telle quelle — y compris
// le cas `shell: "custom"` de select, qui gère son propre popover.
//
// Effet de bord bienvenu : `date` et `select` acceptaient déjà un
// `field.default` côté schéma, mais aucune interface ne permettait de le
// saisir. Ils l'obtiennent ici sans code supplémentaire.

// Ce qui « ne vaut rien » devient l'absence de défaut, pas un défaut vide :
// c'est le comportement qu'avait déjà l'ancien éditeur booléen (décoché ⇒
// pas de défaut), et il évite de stocker du bruit dans le template.
function normalizeDefault(value: unknown): unknown {
  if (value === null || value === "" || value === false) return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

export default function FieldDefaultValueEditor({
  field,
  onChange,
}: {
  field: TemplateField;
  onChange: (patch: Partial<TemplateField>) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Default value</Label>
      <div className="rounded-md border border-gray-200 bg-white p-2">
        <FieldHost
          field={field}
          value={field.default}
          // Surface window : c'est celle qui offre les présentations les plus
          // complètes (calendrier, choix), et un défaut n'appartient à aucune
          // des deux surfaces réelles.
          surface="window"
          placement={{
            kind: "field",
            id: `default-${field.id}`,
            fieldId: field.id,
          }}
          onCommit={(value) => onChange({ default: normalizeDefault(value) })}
        />
      </div>
      {/* Nécessaire : à vide, la plupart des vues affichent leur placeholder
          en italique, ce qui pourrait se lire comme une valeur déjà posée. */}
      <p className="text-[11px] text-gray-400">
        Pre-filled when a node of this type is created. Leave empty for none.
      </p>
    </div>
  );
}
