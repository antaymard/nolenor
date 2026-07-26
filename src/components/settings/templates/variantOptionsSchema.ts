import type { z } from "zod";

// Introspection minimale d'un `optionsSchema` de variant pour en dériver un
// formulaire. Volontairement limitée aux formes que le catalogue utilise
// réellement (booléen, nombre, enum de strings) : une clé d'une forme non
// reconnue est simplement ignorée par le formulaire plutôt que rendue de
// travers. Elle reste validée côté serveur — on perd l'édition dans l'UI,
// jamais l'intégrité de la donnée.
//
// L'introspection tape dans `_zod.def`, une API interne de Zod : c'est le
// prix d'un formulaire piloté par schéma. Le fallback silencieux ci-dessous
// est ce qui rend une évolution d'API de Zod non fatale (le formulaire
// devient vide, l'app ne casse pas). Si le catalogue grossit, préférer
// déclarer les champs du formulaire à côté du variant plutôt qu'élargir
// cette introspection.

type VariantOptionFieldDescriptor =
  | { key: string; kind: "boolean"; label: string }
  | { key: string; kind: "number"; label: string }
  | { key: string; kind: "enum"; label: string; values: string[] };

type ZodInternal = {
  _zod?: { def?: { type?: string; innerType?: unknown; shape?: unknown; entries?: unknown } };
};

function def(schema: unknown): NonNullable<ZodInternal["_zod"]>["def"] | undefined {
  return (schema as ZodInternal)?._zod?.def;
}

// Déballe les wrappers qui ne changent pas la forme éditable de la valeur.
function unwrap(schema: unknown): unknown {
  let current = schema;
  for (let depth = 0; depth < 10; depth++) {
    const d = def(current);
    if (
      d &&
      (d.type === "default" ||
        d.type === "optional" ||
        d.type === "nullable" ||
        d.type === "prefault") &&
      d.innerType !== undefined
    ) {
      current = d.innerType;
      continue;
    }
    return current;
  }
  return current;
}

// "showUnit" → "Show unit", "maxLines" → "Max lines". Casse de phrase (et non
// de titre) : les clés d'options sont du camelCase, "Show Unit" se lirait
// comme un nom propre.
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function describeVariantOptions(
  optionsSchema: z.ZodTypeAny,
): VariantOptionFieldDescriptor[] {
  const objectSchema = unwrap(optionsSchema);
  const shape = def(objectSchema)?.shape;
  if (!shape || typeof shape !== "object") return [];

  const descriptors: VariantOptionFieldDescriptor[] = [];

  for (const [key, rawEntry] of Object.entries(shape as Record<string, unknown>)) {
    const entry = unwrap(rawEntry);
    const entryDef = def(entry);
    const label = humanizeKey(key);

    switch (entryDef?.type) {
      case "boolean":
        descriptors.push({ key, kind: "boolean", label });
        break;
      case "number":
        descriptors.push({ key, kind: "number", label });
        break;
      case "enum": {
        const entries = entryDef.entries;
        const values =
          entries && typeof entries === "object"
            ? Object.values(entries as Record<string, unknown>).filter(
                (v): v is string => typeof v === "string",
              )
            : [];
        if (values.length > 0) {
          descriptors.push({ key, kind: "enum", label, values });
        }
        break;
      }
      default:
        // Forme non gérée : ignorée (cf. commentaire d'en-tête).
        break;
    }
  }

  return descriptors;
}

export { describeVariantOptions };
export type { VariantOptionFieldDescriptor };
