import { z } from "zod";
import type { Infer } from "convex/values";
import {
  fieldTypeValues,
  type FieldType,
} from "../schemas/fieldTypeSchema";
import { templateFieldValidator } from "../schemas/nodeTemplatesSchema";
import { parseStoredPlateDocument } from "../lib/plateDocumentStorage";

// Source de vérité des types de champs des custom node templates.
// Partagé Convex + front (même pattern que nodeConfig.ts) : la validation
// des écritures (user et agent), les défauts, l'extraction de texte pour la
// recherche et l'affichage LLM dérivent tous d'ici.

const fieldTypeZodValidator = z.enum(fieldTypeValues);

type TemplateField = Infer<typeof templateFieldValidator>;

type SelectChoice = { id: string; label: string; color?: string };

type FieldTypeConfigItem = {
  type: FieldType;
  label: string;
  // Forme des `options` du champ (validée à la création/édition du template).
  optionsSchema: z.ZodTypeAny;
  // Forme stockée de la value dans nodeDatas.values[field.id].
  buildValueSchema: (field: TemplateField) => z.ZodTypeAny;
  // Forme côté LLM si différente de la forme stockée (ex futur : rich_text
  // en markdown). Absent = buildValueSchema.
  buildToolValueSchema?: (field: TemplateField) => z.ZodTypeAny;
  getDefault: (field: TemplateField) => unknown;
  // Texte indexable pour la recherche full-text (null = rien à indexer).
  getSearchableText?: (value: unknown, field: TemplateField) => string | null;
  // Clés R2 à purger à la suppression du node (champs image/file, à venir).
  collectR2Keys?: (value: unknown) => string[];
  // Rendu compact pour read_nodes (ex : ids de select → labels).
  toLLMDisplay?: (value: unknown, field: TemplateField) => string;
};

// ── Helpers d'options ───────────────────────────────────────────────────

function getSelectChoices(field: TemplateField): SelectChoice[] {
  const raw = field.options?.choices;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is SelectChoice =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as SelectChoice).id === "string" &&
      typeof (c as SelectChoice).label === "string",
  );
}

function getNumberUnit(field: TemplateField): string | undefined {
  const unit = field.options?.unit;
  return typeof unit === "string" && unit.length > 0 ? unit : undefined;
}

// Extraction SYNCHRONE du texte brut d'un doc Plate stringifié (recherche,
// affichage compact). La conversion markdown fidèle (async) vit côté agent
// dans customTemplateHelpers.
function extractPlateText(value: unknown): string | null {
  const parsed = parseStoredPlateDocument(value);
  if (!parsed || parsed.length === 0) return null;

  const texts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as { text?: unknown; children?: unknown[] };
    if (typeof record.text === "string" && record.text.trim().length > 0) {
      texts.push(record.text);
    }
    if (Array.isArray(record.children)) {
      record.children.forEach(walk);
    }
  };
  parsed.forEach(walk);

  const text = texts.join(" ").trim();
  return text.length > 0 ? text : null;
}

// ── Catalogue ───────────────────────────────────────────────────────────

const fieldTypeConfig: Array<FieldTypeConfigItem> = [
  {
    type: "short_text",
    label: "Text",
    optionsSchema: z
      .strictObject({ placeholder: z.string().max(200).optional() })
      .optional(),
    buildValueSchema: () => z.string().max(2000),
    getDefault: (field) =>
      typeof field.default === "string" ? field.default : "",
    getSearchableText: (value) =>
      typeof value === "string" && value.trim().length > 0 ? value : null,
    toLLMDisplay: (value) => (typeof value === "string" ? value : ""),
  },
  {
    type: "number",
    label: "Number",
    optionsSchema: z
      .strictObject({
        unit: z.string().max(30).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),
    // Nullable : updateValues merge les values côté serveur (une clé ne
    // peut jamais être retirée), null est le marqueur « valeur effacée ».
    buildValueSchema: (field) => {
      let schema = z.number().finite();
      const min = field.options?.min;
      const max = field.options?.max;
      if (typeof min === "number") schema = schema.min(min);
      if (typeof max === "number") schema = schema.max(max);
      return schema.nullable();
    },
    getDefault: (field) =>
      typeof field.default === "number" ? field.default : undefined,
    getSearchableText: (value, field) => {
      if (typeof value !== "number") return null;
      const unit = getNumberUnit(field);
      return unit ? `${value} ${unit}` : String(value);
    },
    toLLMDisplay: (value, field) => {
      if (typeof value !== "number") return "";
      const unit = getNumberUnit(field);
      return unit ? `${value} ${unit}` : String(value);
    },
  },
  {
    type: "date",
    label: "Date",
    optionsSchema: z
      .strictObject({ includeTime: z.boolean().optional() })
      .optional(),
    // Stockage en ISO : lisible par le LLM, timezone explicite. Nullable :
    // null = valeur effacée (cf. commentaire sur number).
    buildValueSchema: (field) => {
      if (field.options?.includeTime === true) {
        return z
          .union([
            z.iso.datetime({ offset: true }),
            z.iso.datetime(),
            z.iso.date(),
          ])
          .nullable();
      }
      return z.iso.date().nullable();
    },
    getDefault: (field) =>
      typeof field.default === "string" ? field.default : undefined,
    getSearchableText: (value) =>
      typeof value === "string" && value.length > 0 ? value : null,
    toLLMDisplay: (value) => (typeof value === "string" ? value : ""),
  },
  {
    type: "select",
    label: "Select",
    optionsSchema: z.strictObject({
      choices: z
        .array(
          z.strictObject({
            id: z.string().min(1).max(64),
            label: z.string().min(1).max(80),
            color: z.string().max(30).optional(),
          }),
        )
        .min(1)
        .max(50),
      isMulti: z.boolean().optional(),
    }),
    // Value = tableau d'ids d'options (mono-select : longueur ≤ 1), même
    // convention que les colonnes select des tables.
    buildValueSchema: (field) => {
      const choiceIds = getSelectChoices(field).map((c) => c.id);
      const item =
        choiceIds.length > 0
          ? z.enum(choiceIds as [string, ...string[]])
          : z.string();
      let schema = z.array(item);
      if (field.options?.isMulti !== true) {
        schema = schema.max(1);
      }
      return schema;
    },
    getDefault: (field) => (Array.isArray(field.default) ? field.default : []),
    getSearchableText: (value, field) => {
      const labels = selectIdsToLabels(value, field);
      return labels.length > 0 ? labels.join(", ") : null;
    },
    toLLMDisplay: (value, field) => selectIdsToLabels(value, field).join(", "),
  },
  {
    type: "boolean",
    label: "Checkbox",
    optionsSchema: z.strictObject({}).optional(),
    buildValueSchema: () => z.boolean(),
    getDefault: (field) =>
      typeof field.default === "boolean" ? field.default : false,
    toLLMDisplay: (value) => (value === true ? "true" : "false"),
  },
  {
    type: "rich_text",
    label: "Rich text",
    optionsSchema: z.strictObject({}).optional(),
    // Stocké comme les nodes document : Plate JSON stringifié
    // (stringifyPlateDocumentForStorage au call-site window).
    buildValueSchema: () => z.string(),
    // Le LLM écrit du markdown ; setNodeDataTool convertit en Plate avant
    // l'écriture (même cycle que les nodes document).
    buildToolValueSchema: () =>
      z
        .string()
        .describe(
          "Markdown content (converted to rich text on save; replaces the whole field)",
        ),
    getDefault: () => undefined,
    getSearchableText: (value) => extractPlateText(value),
    toLLMDisplay: (value) => extractPlateText(value) ?? "",
  },
  {
    type: "image",
    label: "Image",
    optionsSchema: z.strictObject({}).optional(),
    // `key` présent uniquement pour les uploads R2 (cascade de suppression) ;
    // les URLs externes posées par l'agent n'en ont pas. null = effacée.
    buildValueSchema: () =>
      z
        .object({
          url: z.string().describe("Public URL of the image."),
          key: z
            .string()
            .optional()
            .describe("Internal storage key (set for uploaded images only)."),
        })
        .nullable(),
    getDefault: () => undefined,
    collectR2Keys: (value) => {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as { key?: unknown }).key === "string"
      ) {
        return [(value as { key: string }).key];
      }
      return [];
    },
    toLLMDisplay: (value) => {
      const url =
        value && typeof value === "object"
          ? (value as { url?: unknown }).url
          : undefined;
      return typeof url === "string" ? url : "";
    },
  },
];

function selectIdsToLabels(value: unknown, field: TemplateField): string[] {
  if (!Array.isArray(value)) return [];
  const choices = getSelectChoices(field);
  return value
    .filter((id): id is string => typeof id === "string")
    .map((id) => choices.find((c) => c.id === id)?.label ?? id);
}

function getFieldTypeConfig(type: FieldType): FieldTypeConfigItem {
  const config = fieldTypeConfig.find((item) => item.type === type);
  if (!config) {
    throw new Error(`Unknown field type: ${type}`);
  }
  return config;
}

// ── Définition d'un champ (validation à la création/édition du template) ─

const templateFieldSchema = z
  .strictObject({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(80),
    type: fieldTypeZodValidator,
    required: z.boolean().optional(),
    description: z.string().max(500).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    default: z.unknown().optional(),
  })
  .superRefine((field, ctx) => {
    const config = getFieldTypeConfig(field.type);

    const optionsResult = config.optionsSchema.safeParse(field.options);
    if (!optionsResult.success) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `Invalid options for field "${field.name}" (${field.type}): ${optionsResult.error.issues
          .map((i) => i.message)
          .join("; ")}`,
      });
      return;
    }

    if (field.default !== undefined) {
      const defaultResult = config
        .buildValueSchema(field as TemplateField)
        .safeParse(field.default);
      if (!defaultResult.success) {
        ctx.addIssue({
          code: "custom",
          path: ["default"],
          message: `Invalid default for field "${field.name}" (${field.type})`,
        });
      }
    }
  });

// ── Schémas au niveau template ──────────────────────────────────────────

function describeFieldForLLM(field: TemplateField): string {
  return field.description
    ? `${field.name} — ${field.description}`
    : field.name;
}

type TemplateFieldsSource = { fields: TemplateField[] };

// Forme des values d'une instance. Loose : tolère les values orphelines de
// champs supprimés (elles sont conservées, ignorées au rendu). Toutes les
// clés sont optionnelles — l'évolution du template rend légitime l'absence
// de n'importe quelle clé ; `required` est un concern UI, pas un rejet
// d'écriture.
function buildTemplateValuesSchema(template: TemplateFieldsSource) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of template.fields) {
    shape[field.id] = getFieldTypeConfig(field.type)
      .buildValueSchema(field)
      .optional()
      .describe(describeFieldForLLM(field));
  }
  return z.looseObject(shape);
}

// Forme des écritures de l'agent (set_node_data). Strict : seuls les
// fieldIds existants sont acceptés, pour que l'erreur minimap renvoie le
// schéma exact au LLM.
function buildTemplateToolSchema(template: TemplateFieldsSource) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of template.fields) {
    const config = getFieldTypeConfig(field.type);
    const build = config.buildToolValueSchema ?? config.buildValueSchema;
    shape[field.id] = build(field)
      .optional()
      .describe(describeFieldForLLM(field));
  }
  return z.strictObject(shape);
}

// Miroir de getDefaultNodeDataValues pour les custom nodes.
function getDefaultValuesForTemplate(
  template: TemplateFieldsSource,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of template.fields) {
    const config = getFieldTypeConfig(field.type);
    const value =
      field.default !== undefined ? field.default : config.getDefault(field);
    if (value !== undefined) {
      values[field.id] = value;
    }
  }
  return values;
}

// Texte indexable pour la recherche full-text (chunkBuilder).
function getSearchableTextForTemplateValues(
  template: TemplateFieldsSource,
  values: Record<string, unknown>,
): string {
  const lines: string[] = [];
  for (const field of template.fields) {
    const config = getFieldTypeConfig(field.type);
    if (!config.getSearchableText) continue;
    const text = config.getSearchableText(values[field.id], field);
    if (text) {
      lines.push(`${field.name}: ${text}`);
    }
  }
  return lines.join("\n");
}

// Clés R2 référencées par les values (cascade de suppression).
function collectR2KeysForTemplateValues(
  template: TemplateFieldsSource,
  values: Record<string, unknown>,
): string[] {
  const keys: string[] = [];
  for (const field of template.fields) {
    const config = getFieldTypeConfig(field.type);
    if (!config.collectR2Keys) continue;
    keys.push(...config.collectR2Keys(values[field.id]));
  }
  return keys;
}

export {
  fieldTypeConfig,
  fieldTypeZodValidator,
  getFieldTypeConfig,
  getSelectChoices,
  selectIdsToLabels,
  templateFieldSchema,
  buildTemplateValuesSchema,
  buildTemplateToolSchema,
  getDefaultValuesForTemplate,
  getSearchableTextForTemplateValues,
  collectR2KeysForTemplateValues,
  describeFieldForLLM,
};
export type { TemplateField, FieldTypeConfigItem, SelectChoice };
