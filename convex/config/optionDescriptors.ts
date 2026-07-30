import { z } from "zod";

// Descripteurs d'options — la déclaration d'où TOUT est dérivé : le
// formulaire du builder ET le schéma Zod de validation.
//
// Pourquoi pas l'inverse (dériver le formulaire du schéma) : c'est ce qui
// existait, et ça obligeait à introspecter `_zod.def`, une API interne de Zod.
// En plus d'être fragile, un schéma ne porte pas ce qu'un formulaire réclame —
// un libellé lisible, un texte d'aide, un ordre d'affichage. L'introspection
// devait deviner le libellé depuis le nom de la clé.
//
// Partagé Convex + front : aucun import React, aucune dépendance lourde.

type OptionFieldDescriptorBase = {
  key: string;
  label: string;
  // Phrase courte affichée sous le contrôle. Réservée à ce qu'un libellé ne
  // peut pas dire — pas une paraphrase du nom de l'option.
  help?: string;
};

type OptionFieldDescriptor =
  | (OptionFieldDescriptorBase & { kind: "boolean"; default: boolean })
  | (OptionFieldDescriptorBase & {
      kind: "number";
      default: number;
      min?: number;
      max?: number;
      integer?: boolean;
    })
  | (OptionFieldDescriptorBase & {
      kind: "text";
      default?: string;
      maxLength?: number;
      placeholder?: string;
    })
  | (OptionFieldDescriptorBase & {
      kind: "enum";
      default: string;
      // Libellés explicites : sans eux le formulaire afficherait "sm" au lieu
      // de "Small".
      values: { value: string; label: string }[];
    });

// ── Construction des schémas ─────────────────────────────────────────────
//
// DEUX constructeurs et non un drapeau, parce que les deux usages ont des
// politiques opposées, et les confondre casserait des données :
//
//   • variantOptions — invalides, elles sont NORMALISÉES (réécrites vers le
//     défaut) ; on veut donc un objet toujours complet, défauts appliqués.
//   • field.options — invalides, elles font ÉCHOUER l'enregistrement du
//     template. Y introduire des défauts ou des clés requises rendrait
//     non-sauvegardables des templates existants dont les champs n'ont pas
//     d'options. Elles doivent rester intégralement facultatives.

function baseSchema(descriptor: OptionFieldDescriptor): z.ZodTypeAny {
  switch (descriptor.kind) {
    case "boolean":
      return z.boolean();
    case "number": {
      let schema = descriptor.integer ? z.number().int() : z.number();
      if (descriptor.min !== undefined) schema = schema.min(descriptor.min);
      if (descriptor.max !== undefined) schema = schema.max(descriptor.max);
      return schema;
    }
    case "text": {
      let schema = z.string();
      if (descriptor.maxLength !== undefined) {
        schema = schema.max(descriptor.maxLength);
      }
      return schema;
    }
    case "enum":
      return z.enum(
        descriptor.values.map((v) => v.value) as [string, ...string[]],
      );
  }
}

function descriptorDefault(descriptor: OptionFieldDescriptor): unknown {
  return descriptor.kind === "text"
    ? (descriptor.default ?? "")
    : descriptor.default;
}

/**
 * Options toujours résolues : un `.default()` PAR CLÉ, et rien sur l'objet.
 * En Zod 4, un `.default()` posé sur l'objet court-circuite le parsing et rend
 * la valeur telle quelle — `parse(undefined)` donnerait `{}` au lieu d'un
 * objet complet. `z.object` (et non `strictObject`) : une clé inconnue est
 * ignorée, là où une erreur ferait perdre les options valides à côté d'elle.
 */
function buildResolvedOptionsSchema(descriptors: OptionFieldDescriptor[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const descriptor of descriptors) {
    shape[descriptor.key] = baseSchema(descriptor).default(
      descriptorDefault(descriptor) as never,
    );
  }
  return z.object(shape);
}

/**
 * Options intégralement facultatives, objet strict et lui-même facultatif.
 * Reproduit la tolérance de ce qui est stocké aujourd'hui dans
 * `field.options` : aucune clé requise, aucun défaut injecté dans la donnée,
 * mais une clé inconnue reste refusée.
 */
function buildLooseOptionsSchema(descriptors: OptionFieldDescriptor[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const descriptor of descriptors) {
    shape[descriptor.key] = baseSchema(descriptor).optional();
  }
  return z.strictObject(shape).optional();
}

// Les tableaux de descripteurs sont des littéraux de module : leur identité
// est stable, un WeakMap suffit donc à ne construire chaque schéma qu'une
// fois. Sans ça, resolveVariantOptions reconstruirait un schéma Zod à chaque
// rendu de champ.
const resolvedSchemaCache = new WeakMap<
  OptionFieldDescriptor[],
  ReturnType<typeof buildResolvedOptionsSchema>
>();

function getResolvedOptionsSchema(descriptors: OptionFieldDescriptor[]) {
  const cached = resolvedSchemaCache.get(descriptors);
  if (cached) return cached;
  const schema = buildResolvedOptionsSchema(descriptors);
  resolvedSchemaCache.set(descriptors, schema);
  return schema;
}

export {
  buildResolvedOptionsSchema,
  buildLooseOptionsSchema,
  getResolvedOptionsSchema,
};
export type { OptionFieldDescriptor };
