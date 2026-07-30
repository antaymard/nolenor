import { getSelectChoices } from "@/../convex/config/fieldConfig";
import type { TemplateField } from "@/../convex/config/fieldConfig";
import type { FieldType } from "@/../convex/schemas/fieldTypeSchema";

// Valeurs d'exemple de l'aperçu du builder — JAMAIS persistées.
//
// `Record<FieldType, …>` et non un `switch` : c'est ce qui fait qu'ajouter un
// type de champ sans exemple est une erreur de COMPILATION. Le switch qui
// vivait dans TemplatePreview n'avait pas de garde d'exhaustivité, donc un
// nouveau type serait passé en silence, rendu vide dans l'aperçu, sans que
// personne comprenne pourquoi.
//
// Côté front et non dans fieldConfig : c'est une préoccupation de builder, et
// tout ce que Convex analyse au déploiement a un coût (cf. les avertissements
// sur les imports lourds dans convex/config).

type FieldSampleKind = "filled" | "empty" | "overflow";

type FieldSampleSet = {
  filled: (field: TemplateField) => unknown;
  // Absent = ce type n'a pas de notion de débordement (une case cochée ou une
  // date n'ont qu'une taille). L'état "overflow" retombe alors sur `filled`,
  // ce qui est le rendu honnête : rien à stresser ici.
  overflow?: (field: TemplateField) => unknown;
};

// Placeholder inline : le seul moyen d'avoir une image dans l'aperçu sans
// requête réseau ni fichier à servir. Avant, l'aperçu ne montrait JAMAIS un
// champ image rempli — seulement son état vide.
function placeholderImage(width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="%23e2e8f0"/>
    <circle cx="${width * 0.3}" cy="${height * 0.3}" r="${Math.min(width, height) * 0.1}" fill="%2394a3b8"/>
    <path d="M0 ${height} L${width * 0.4} ${height * 0.45} L${width * 0.65} ${height} Z" fill="%2394a3b8"/>
    <path d="M${width * 0.45} ${height} L${width * 0.75} ${height * 0.6} L${width} ${height} Z" fill="%23cbd5e1"/>
  </svg>`;
  return `data:image/svg+xml;utf8,${svg.replace(/\s+/g, " ").trim()}`;
}

// Les bornes d'un champ nombre sont appliquées par son buildValueSchema : un
// exemple hors bornes serait une valeur invalide dans l'aperçu.
function clampToFieldBounds(field: TemplateField, value: number): number {
  const min = field.options?.min;
  const max = field.options?.max;
  let next = value;
  if (typeof min === "number" && next < min) next = min;
  if (typeof max === "number" && next > max) next = max;
  return next;
}

function richTextDocument(blocks: unknown[]): string {
  return JSON.stringify(blocks);
}

function paragraph(id: string, text: string) {
  return { id, type: "paragraph", content: [{ type: "text", text }] };
}

const LOREM =
  "Cette valeur est délibérément très longue, pour révéler les mises en page qui ne tiennent pas : troncature absente, hauteur qui explose, colonne qui pousse ses voisines hors du cadre.";

const fieldSamples: Record<FieldType, FieldSampleSet> = {
  short_text: {
    filled: (field) => `Sample ${field.name.toLowerCase()}`,
    overflow: () => LOREM,
  },

  number: {
    filled: (field) => clampToFieldBounds(field, 42),
    // Un nombre long ET fractionnaire : c'est la largeur du rendu qu'on teste.
    overflow: (field) => clampToFieldBounds(field, 1234567.89),
  },

  date: {
    filled: () => new Date().toISOString().slice(0, 10),
    // Pas d'overflow : une date a une largeur bornée par son format.
  },

  select: {
    filled: (field) => {
      const first = getSelectChoices(field)[0];
      return first ? [first.id] : [];
    },
    overflow: (field) => {
      const choices = getSelectChoices(field);
      if (choices.length === 0) return [];
      // Un select SIMPLE est borné à une valeur par son buildValueSchema :
      // lui envoyer toute la liste produirait une valeur invalide (attrapé
      // par les assertions). Son cas de débordement est donc le libellé le
      // plus long, pas le nombre de pastilles.
      if (field.options?.isMulti !== true) {
        const longest = choices.reduce((a, b) =>
          b.label.length > a.label.length ? b : a,
        );
        return [longest.id];
      }
      // Multi : tous les choix — le seul moyen de voir si les pastilles
      // passent à la ligne proprement.
      return choices.map((choice) => choice.id);
    },
  },

  boolean: {
    filled: () => true,
    // Pas d'overflow : une case a une taille fixe.
  },

  rich_text: {
    filled: (field) =>
      richTextDocument([
        paragraph(`sample-${field.id}`, `Sample ${field.name} content.`),
      ]),
    overflow: (field) =>
      richTextDocument([
        {
          id: `sample-${field.id}-h`,
          type: "heading",
          props: { level: 2 },
          content: [{ type: "text", text: "Un titre de section" }],
        },
        paragraph(`sample-${field.id}-p1`, LOREM),
        {
          id: `sample-${field.id}-li`,
          type: "bulletListItem",
          content: [{ type: "text", text: "Un premier point de liste" }],
        },
        {
          id: `sample-${field.id}-li2`,
          type: "bulletListItem",
          content: [{ type: "text", text: "Un second, plus long que le premier" }],
        },
        paragraph(`sample-${field.id}-p2`, LOREM),
      ]),
  },

  image: {
    filled: () => ({ url: placeholderImage(320, 200) }),
    // Format très haut : c'est ce qui fait exploser la hauteur d'un node.
    overflow: () => ({ url: placeholderImage(320, 900) }),
  },
};

// `empty` est générique — aucune valeur, pas une valeur « vide » par type :
// c'est exactement l'état d'un node fraîchement créé.
function buildSampleValues(
  fields: TemplateField[],
  kind: FieldSampleKind,
): Record<string, unknown> {
  if (kind === "empty") return {};

  const values: Record<string, unknown> = {};
  for (const field of fields) {
    const samples = fieldSamples[field.type];
    const build = kind === "overflow" ? (samples.overflow ?? samples.filled) : samples.filled;
    const value = build(field);
    if (value !== undefined) values[field.id] = value;
  }
  return values;
}

export { fieldSamples, buildSampleValues };
export type { FieldSampleKind, FieldSampleSet };
