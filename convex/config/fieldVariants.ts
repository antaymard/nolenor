import { z } from "zod";
import { fieldTypeValues, type FieldType } from "../schemas/fieldTypeSchema";

// Couche 2 du design "variants de champs" (custom nodes) : déclaration des
// présentations possibles par type de champ, indépendante de la sémantique
// de valeur (fieldConfig.ts) et de tout composant React. Un variant est
// purement présentationnel — il ne change jamais la valeur stockée.
//
// Phase 2 : un seul variant par surface et par type (deux pour rich_text,
// structurellement asymétrique aujourd'hui — node = aperçu statique, window
// = éditeur). Objectif de cette phase : que `resolveFieldVariant` et la
// normalisation des templates existent et ne crashent jamais, pas encore
// offrir un choix à l'utilisateur (Phase 4/5 enrichit le catalogue).

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
  // Le variant affiche lui-même son label (ex. futur "checkbox_label") : le
  // switch showLabel du placement reste stocké tel quel et n'est jamais
  // supprimé côté builder, seule la vue décide où le label apparaît.
  ownsLabel?: boolean;
  optionsSchema?: z.ZodTypeAny;
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
      },
      {
        id: "full",
        label: "Full editor",
        surfaces: ["window"],
        edit: "inline",
        commit: "deferred",
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
    ],
    defaultBySurface: { node: "full", window: "full" },
  },
} satisfies Record<FieldType, FieldVariantCatalogEntry>;

// Dérivé de `satisfies` (pas d'annotation de type qui élargirait `id` en
// `string`) : chaque type garde ses ids de variant en union littérale,
// vérifiable par le compilateur une fois qu'un `views: Record<VariantId<T>,
// View>` existera (Phase 3).
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
  // `fieldVariants[type]` indexé par le type large FieldType (pas un
  // littéral précis) : TS élargit `surfaces` en `never[]` dans ce contexte
  // précis (chaque entrée du catalogue a un tuple littéral différent). Le
  // cast est nécessaire ici ; `assertCatalogEntry` s'en passe car son
  // paramètre est explicitement typé en `FieldVariantCatalogEntry`.
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

// ── Assertions au chargement du module ───────────────────────────────────
// Le catalogue est un `satisfies`, pas un validateur : ces invariants
// structurels (au-delà de ce que le compilateur peut vérifier) sont donc
// contrôlés une fois, au chargement du module, plutôt qu'à chaque rendu.
// Une violation ici est une erreur de configuration à corriger avant tout
// déploiement — jamais un état à tolérer en prod.

function assertFieldVariantsConfig(): void {
  const surfaces: FieldSurface[] = ["node", "window"];

  for (const type of fieldTypeValues) {
    // Widening explicite vers le type déclaré (pas celui, plus étroit,
    // inféré par `satisfies` sur les littéraux du catalogue actuel) : sans
    // ça, TS voit qu'aucun variant présent aujourd'hui n'a edit:"window" et
    // marque le contrôle ci-dessous comme mort code — alors qu'il doit rester
    // vivant pour les variants que Phase 4/5 ajouteront.
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

export { fieldVariants, resolveFieldVariant };
export type { FieldSurface, FieldVariantDef, FieldVariantCatalogEntry, VariantId };
