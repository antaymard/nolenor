import { fieldTypeValues, type FieldType } from "../schemas/fieldTypeSchema";
import {
  getResolvedOptionsSchema,
  type OptionFieldDescriptor,
} from "./optionDescriptors";

// Couche 2 du design "variants de champs" (custom nodes) : déclaration des
// présentations possibles par type de champ, indépendante de la sémantique
// de valeur (fieldConfig.ts) et de tout composant React. Un variant est
// purement présentationnel — il ne change jamais la valeur stockée.
//
// Ce module est la source unique du catalogue : ajouter un variant ici et son
// entrée dans le registry front (fieldRegistry.tsx, vérifié à la compilation
// par `satisfies Record<VariantId<T>, …>`) suffit à le rendre choisissable
// dans le builder. Rien d'autre à toucher — ni validation serveur, ni rendu.
//
// Deux garanties portées ici plutôt que par les appelants :
// `resolveFieldVariant` et `parseVariantOptions` sont TOTALES (un placement
// dont le variant a disparu du catalogue rend le défaut de sa surface, il ne
// plante pas), et les invariants structurels sont vérifiés au chargement du
// module, pas au rendu.

type FieldSurface = "node" | "window";

type FieldVariantDef = {
  id: string;
  label: string;
  // Surfaces où ce variant est autorisé — validé côté serveur à l'écriture
  // d'un template (cf. templateConfig.ts).
  surfaces: FieldSurface[];
  edit: "inline" | "popover" | "window" | "none";
  // Politique de commit PAR VARIANT (pas par type) : un même type peut être
  // blur-inline sur une surface et deferred-derrière-une-window sur l'autre.
  commit: "immediate" | "blur" | "deferred";
  // Le variant affiche lui-même son label (ex. boolean.checkbox_label, qui le
  // met à côté de la case) : le switch showLabel du placement reste stocké tel
  // quel et n'est jamais supprimé côté builder, seule la vue décide OÙ le
  // label apparaît.
  ownsLabel?: boolean;
  // Options d'affichage de CE variant. Déclaratives : le formulaire du
  // builder et le schéma de validation en sont tous deux dérivés, il n'y a
  // donc pas de schéma à tenir en phase à côté (cf. optionDescriptors).
  optionFields?: OptionFieldDescriptor[];
};

type FieldVariantCatalogEntry = {
  variants: FieldVariantDef[];
  defaultBySurface: Record<FieldSurface, string>;
};

const fieldVariants = {
  short_text: {
    variants: [
      {
        id: "plain",
        label: "Plain text",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "blur",
      },
      {
        id: "heading",
        label: "Heading",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "blur",
      },
    ],
    defaultBySurface: { node: "plain", window: "plain" },
  },
  number: {
    variants: [
      {
        id: "plain",
        label: "Plain number",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "blur",
      },
      {
        id: "kpi",
        label: "KPI",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "blur",
        // Un `.default()` par clé, et RIEN sur l'objet : en Zod 4,
        // `.default(x)` court-circuite le parsing et rend `x` tel quel, donc
        // un `.default({})` sur l'objet renverrait `{}` sans appliquer les
        // défauts des clés. C'est parseVariantOptions qui garantit un objet
        // complet, en parsant `{}` plutôt que `undefined`.
        optionFields: [
          {
            key: "showUnit",
            kind: "boolean",
            label: "Show unit",
            default: true,
          },
        ],
      },
    ],
    defaultBySurface: { node: "plain", window: "plain" },
  },
  date: {
    variants: [
      {
        id: "absolute",
        label: "Absolute date",
        surfaces: ["node", "window"],
        edit: "popover",
        commit: "immediate",
      },
      {
        id: "relative",
        label: "Relative date",
        surfaces: ["node", "window"],
        edit: "popover",
        commit: "immediate",
      },
    ],
    defaultBySurface: { node: "absolute", window: "absolute" },
  },
  select: {
    variants: [
      {
        id: "chips",
        label: "Chips",
        surfaces: ["node", "window"],
        edit: "popover",
        commit: "immediate",
      },
      {
        id: "text",
        label: "Plain text",
        surfaces: ["node", "window"],
        edit: "popover",
        commit: "immediate",
      },
    ],
    defaultBySurface: { node: "chips", window: "chips" },
  },
  boolean: {
    variants: [
      {
        id: "checkbox",
        label: "Checkbox",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "immediate",
      },
      {
        id: "checkbox_label",
        label: "Checkbox with label",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "immediate",
        // La vue affiche le label elle-même, en ligne : FieldHost ne rend
        // alors pas le label au-dessus. `showLabel` reste stocké tel quel
        // sur le placement et transmis à la vue — repasser à `checkbox` ne
        // ressuscite jamais un label que l'utilisateur avait désactivé.
        ownsLabel: true,
      },
      {
        id: "badge",
        label: "Badge (read-only)",
        surfaces: ["node", "window"],
        edit: "none",
        commit: "immediate",
      },
    ],
    defaultBySurface: { node: "checkbox", window: "checkbox" },
  },
  // Seul type structurellement asymétrique aujourd'hui : le node n'affiche
  // jamais d'éditeur (aperçu statique virtualisé), la window seule édite,
  // derrière le canal différé du WindowFrame.
  rich_text: {
    variants: [
      {
        id: "excerpt",
        label: "Excerpt",
        surfaces: ["node"],
        edit: "none",
        commit: "immediate",
        // Nombre de lignes visibles de l'extrait. Un `.default()` par clé,
        // rien sur l'objet (cf. number.kpi pour le pourquoi).
        optionFields: [
          {
            key: "lines",
            kind: "number",
            label: "Lines",
            help: "Height of the excerpt, in lines of text.",
            default: 3,
            min: 1,
            max: 20,
            integer: true,
          },
        ],
      },
      {
        id: "full",
        label: "Full editor",
        surfaces: ["window"],
        edit: "inline",
        commit: "deferred",
      },
      // Node uniquement, et edit:"window" : un clic ouvre la window plutôt
      // que de monter un éditeur sur le canvas. Un `link` autorisé en window
      // serait soit une auto-escalade illégale, soit un libellé inerte.
      {
        id: "link",
        label: "Link to window",
        surfaces: ["node"],
        edit: "window",
        commit: "immediate",
      },
    ],
    defaultBySurface: { node: "excerpt", window: "full" },
  },
  image: {
    variants: [
      {
        id: "full",
        label: "Full image",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "immediate",
      },
      {
        id: "thumbnail",
        label: "Thumbnail",
        surfaces: ["node", "window"],
        edit: "inline",
        commit: "immediate",
        optionFields: [
          {
            key: "size",
            kind: "enum",
            label: "Size",
            default: "md",
            values: [
              { value: "sm", label: "Small" },
              { value: "md", label: "Medium" },
              { value: "lg", label: "Large" },
            ],
          },
        ],
      },
      {
        id: "link",
        label: "Link (read-only)",
        surfaces: ["node", "window"],
        edit: "none",
        commit: "immediate",
      },
    ],
    defaultBySurface: { node: "thumbnail", window: "full" },
  },
} satisfies Record<FieldType, FieldVariantCatalogEntry>;

// Dérivé de `satisfies` (pas d'annotation de type qui élargirait `id` en
// `string`) : chaque type garde ses ids de variant en union littérale. C'est
// ce qui rend `satisfies Record<VariantId<T>, FieldVariantRegistration>` dans
// fieldRegistry.tsx capable de détecter à la COMPILATION un variant déclaré
// ici sans composant, ou l'inverse.
type VariantId<T extends FieldType> =
  (typeof fieldVariants)[T]["variants"][number]["id"];

// Fonction TOTALE : ne lève jamais au rendu. Un trou de configuration est une
// erreur de chargement de module (cf. assertions plus bas), jamais un crash
// de rendu — la chaîne de repli couvre le cas où un variant enregistré sur un
// placement a depuis disparu du catalogue (variant retiré, template plus
// ancien que le catalogue courant).
function resolveFieldVariant(
  type: FieldType,
  surface: FieldSurface,
  requested?: string,
): FieldVariantDef {
  // `fieldVariants[type]` indexé par le type large FieldType donne l'UNION
  // des entrées du catalogue. Chacune ayant son propre tuple littéral de
  // surfaces, l'élément commun se réduit à `never` et `.includes(surface)`
  // devient inappelable — d'où le cast. `assertCatalogEntry` s'en passe
  // seulement parce que son paramètre est explicitement typé en
  // `FieldVariantCatalogEntry`, ce qui rétablit `FieldSurface[]`.
  const catalog = fieldVariants[type];
  const allowedOnSurface = catalog.variants.filter((variant) =>
    (variant.surfaces as FieldSurface[]).includes(surface),
  );

  if (requested !== undefined) {
    const requestedMatch = allowedOnSurface.find(
      (variant) => variant.id === requested,
    );
    if (requestedMatch) return requestedMatch;
  }

  const defaultId: string = catalog.defaultBySurface[surface];
  const defaultMatch = allowedOnSurface.find(
    (variant) => variant.id === defaultId,
  );
  if (defaultMatch) return defaultMatch;

  // Repli ultime, ne devrait jamais s'exécuter : les assertions au
  // chargement du module garantissent ≥1 variant par surface pour chaque
  // type. Gardé pour que la fonction reste totale même si cette garantie
  // était un jour cassée par erreur.
  return allowedOnSurface[0] ?? catalog.variants[0];
}

// Résout les options d'un variant en un objet COMPLET (défauts appliqués) ou
// `undefined` si le variant n'en déclare pas. Comme resolveFieldVariant :
// fonction totale, ne lève jamais. Des options invalides (variant changé
// depuis, schéma resserré) retombent sur les défauts du schéma plutôt que de
// faire planter la vue — le prochain save du template les normalisera
// (cf. normalizeLayoutTree).
function parseVariantOptions(
  variant: FieldVariantDef,
  raw: unknown,
): Record<string, unknown> | undefined {
  if (!variant.optionFields || variant.optionFields.length === 0) {
    return undefined;
  }
  // Schéma dérivé des descripteurs, construit une seule fois et mis en cache
  // sur l'identité du tableau (littéral de module).
  const schema = getResolvedOptionsSchema(variant.optionFields);

  // `raw ?? {}` et non `raw` : en Zod 4, parser `undefined` contre un objet
  // sans `.default()` échoue, et avec un `.default({})` rendrait `{}` sans
  // appliquer les défauts des clés. Parser `{}` est le seul chemin qui
  // produit un objet réellement complet.
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data as Record<string, unknown>;

  const defaults = schema.safeParse({});
  return defaults.success
    ? (defaults.data as Record<string, unknown>)
    : undefined;
}

// ── Assertions au chargement du module ───────────────────────────────────
// Le catalogue est un `satisfies`, pas un validateur : ces invariants
// structurels (au-delà de ce que le compilateur peut vérifier) sont donc
// contrôlés une fois, au chargement du module, plutôt qu'à chaque rendu.
// Une violation ici est une erreur de configuration à corriger avant tout
// déploiement — jamais un état à tolérer en prod.

function assertFieldVariantsConfig(): void {
  const surfaces: FieldSurface[] = ["node", "window"];

  for (const type of fieldTypeValues) {
    // Le paramètre de assertCatalogEntry est explicitement typé en
    // FieldVariantCatalogEntry : ce widening est ce qui rend
    // `variant.surfaces.includes(surface)` possible à l'intérieur (même cause
    // que le cast dans resolveFieldVariant, cf. son commentaire).
    assertCatalogEntry(type, fieldVariants[type], surfaces);
  }
}

function assertCatalogEntry(
  type: FieldType,
  catalog: FieldVariantCatalogEntry,
  surfaces: FieldSurface[],
): void {
  if (catalog.variants.length === 0) {
    throw new Error(`fieldVariants: "${type}" has no variant declared.`);
  }

  const seenIds = new Set<string>();
  for (const variant of catalog.variants) {
    if (seenIds.has(variant.id)) {
      throw new Error(
        `fieldVariants: "${type}" declares variant id "${variant.id}" more than once.`,
      );
    }
    seenIds.add(variant.id);

    // Un variant edit:"window" escalade VERS la window : il ne peut pas se
    // désigner lui-même comme cible (auto-escalade illégale).
    if (variant.edit === "window" && variant.surfaces.includes("window")) {
      throw new Error(
        `fieldVariants: "${type}.${variant.id}" has edit:"window" but lists "window" in its own surfaces (illegal self-escalation).`,
      );
    }

    // Un commit différé n'a de sens que derrière le flux dirty/save d'un
    // WindowFrame — jamais sur le node canvas.
    if (
      variant.commit === "deferred" &&
      !(variant.surfaces.length === 1 && variant.surfaces[0] === "window")
    ) {
      throw new Error(
        `fieldVariants: "${type}.${variant.id}" has commit:"deferred" but surfaces is not exactly ["window"].`,
      );
    }
  }

  for (const surface of surfaces) {
    const allowedOnSurface = catalog.variants.filter((variant) =>
      variant.surfaces.includes(surface),
    );
    if (allowedOnSurface.length === 0) {
      throw new Error(
        `fieldVariants: "${type}" has no variant allowed on surface "${surface}".`,
      );
    }
    const defaultId = catalog.defaultBySurface[surface];
    if (!allowedOnSurface.some((variant) => variant.id === defaultId)) {
      throw new Error(
        `fieldVariants: "${type}".defaultBySurface.${surface} = "${defaultId}" is not the id of a variant allowed on that surface.`,
      );
    }
  }
}

assertFieldVariantsConfig();

export { fieldVariants, resolveFieldVariant, parseVariantOptions };
export type { FieldSurface, FieldVariantDef, FieldVariantCatalogEntry, VariantId };
