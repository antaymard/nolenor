import { z } from "zod";
import { toolError } from "../tools/toolHelpers";
import {
  parseRichTextCell,
  richTextFromPlainText,
} from "../../lib/tableRichTextCell";

export type TableColumnType =
  | "text"
  | "richtext"
  | "number"
  | "checkbox"
  | "date"
  | "link"
  | "select"
  | "node";

export type SelectOption = {
  id: string;
  label: string;
  color?: string;
};

export type TableColumn = {
  id: string;
  name: string;
  type: TableColumnType;
  options?: Array<SelectOption>;
  isMulti?: boolean;
};

export const linkValueSchema = z.object({
  href: z.string().min(1),
  pageTitle: z.string().optional(),
  pageImage: z.string().optional(),
  pageDescription: z.string().optional(),
});

const nodeValueObjectSchema = z.object({
  nodeId: z.string().min(1),
});

export const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
  linkValueSchema,
  nodeValueObjectSchema,
]);

export type CellValueInput = z.infer<typeof cellValueSchema>;

export type CellValidationContext = {
  knownCanvasNodeIds: Set<string>;
};

export type CellValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSelectOptionId(
  rawId: string,
  options: SelectOption[],
): string | null {
  const normalized = normalizeLookupKey(rawId);

  const byId = options.find((opt) => opt.id === rawId);
  if (byId) return byId.id;

  const byNormalizedId = options.find(
    (opt) => normalizeLookupKey(opt.id) === normalized,
  );
  if (byNormalizedId) return byNormalizedId.id;

  const byLabel = options.find(
    (opt) => normalizeLookupKey(opt.label) === normalized,
  );
  if (byLabel) return byLabel.id;

  return null;
}

function normalizeSelectValue({
  rawValue,
  column,
}: {
  rawValue: CellValueInput;
  column: TableColumn;
}): CellValidationResult {
  if (rawValue === null) {
    return { ok: true, value: [] };
  }

  const options = column.options ?? [];
  if (options.length === 0) {
    return {
      ok: false,
      error: toolError(
        `Column "${column.name}" (select) has no options defined. Use table_update_schema with operation "update_column" to add options first.`,
      ),
    };
  }

  const rawIds: string[] = Array.isArray(rawValue)
    ? rawValue.filter((id): id is string => typeof id === "string")
    : typeof rawValue === "string" && rawValue.length > 0
      ? [rawValue]
      : [];

  if (rawIds.length === 0 && Array.isArray(rawValue) && rawValue.length === 0) {
    return { ok: true, value: [] };
  }

  if (rawIds.length === 0) {
    return {
      ok: false,
      error: toolError(
        `Invalid value for column "${column.name}" (select). Expected an option id, label, an array of ids, or null.`,
      ),
    };
  }

  if (!column.isMulti && rawIds.length > 1) {
    return {
      ok: false,
      error: toolError(
        `Column "${column.name}" is single-select. Provide a single option id or label, not an array of ${rawIds.length}.`,
      ),
    };
  }

  const resolvedIds: string[] = [];
  const seen = new Set<string>();
  for (const rawId of rawIds) {
    const resolved = resolveSelectOptionId(rawId, options);
    if (!resolved) {
      const validList = options
        .map((opt) => `"${opt.label}" (id: ${opt.id})`)
        .join(", ");
      return {
        ok: false,
        error: toolError(
          `Option "${rawId}" not found in column "${column.name}". Valid options: ${validList}.`,
        ),
      };
    }
    if (!seen.has(resolved)) {
      seen.add(resolved);
      resolvedIds.push(resolved);
    }
  }

  return { ok: true, value: resolvedIds };
}

function normalizeNodeValue({
  rawValue,
  column,
  ctx,
}: {
  rawValue: CellValueInput;
  column: TableColumn;
  ctx: CellValidationContext;
}): CellValidationResult {
  if (rawValue === null) {
    return { ok: true, value: null };
  }

  let nodeId: string | null = null;
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed.length > 0) nodeId = trimmed;
  } else if (
    typeof rawValue === "object" &&
    rawValue !== null &&
    !Array.isArray(rawValue)
  ) {
    const candidate = (rawValue as { nodeId?: unknown }).nodeId;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      nodeId = candidate.trim();
    }
  }

  if (!nodeId) {
    return {
      ok: false,
      error: toolError(
        `Invalid value for column "${column.name}" (node). Expected a nodeId string, { nodeId } object, or null.`,
      ),
    };
  }

  if (!ctx.knownCanvasNodeIds.has(nodeId)) {
    return {
      ok: false,
      error: toolError(
        `Node "${nodeId}" not found on the current canvas (column "${column.name}"). Use list_nodes to find a valid id.`,
      ),
    };
  }

  return { ok: true, value: { nodeId } };
}

export function normalizeCellValueForColumn({
  rawValue,
  column,
  ctx,
}: {
  rawValue: CellValueInput;
  column: TableColumn;
  ctx: CellValidationContext;
}): CellValidationResult {
  if (rawValue === null) {
    return { ok: true, value: null };
  }

  switch (column.type) {
    case "richtext": {
      // L'agent écrit du texte : on le convertit en document (un paragraphe par
      // ligne) plutôt que de lui demander de fabriquer des blocs BlockNote à la
      // main. Un document déjà sérialisé est accepté tel quel, pour que
      // relire-puis-réécrire une cellule ne la dégrade pas.
      if (typeof rawValue === "string") {
        if (parseRichTextCell(rawValue)) {
          return { ok: true, value: rawValue };
        }
        return { ok: true, value: richTextFromPlainText(rawValue) };
      }
      if (Array.isArray(rawValue) && parseRichTextCell(rawValue)) {
        return { ok: true, value: JSON.stringify(rawValue) };
      }
      return {
        ok: false,
        error: toolError(
          `Invalid value for column "${column.name}" (type richtext). Expected a text string (line breaks become paragraphs).`,
        ),
      };
    }

    case "text":
    case "date": {
      if (typeof rawValue !== "string") {
        return {
          ok: false,
          error: toolError(
            `Invalid value for column "${column.name}" (type ${column.type}). Expected a string.`,
          ),
        };
      }
      return { ok: true, value: rawValue };
    }

    case "number": {
      if (typeof rawValue === "number") {
        return { ok: true, value: rawValue };
      }
      if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        const parsed = Number(trimmed);
        if (trimmed.length > 0 && Number.isFinite(parsed)) {
          return { ok: true, value: parsed };
        }
      }
      return {
        ok: false,
        error: toolError(
          `Invalid value for column "${column.name}" (type number). Expected a number or numeric string.`,
        ),
      };
    }

    case "checkbox": {
      if (typeof rawValue === "boolean") {
        return { ok: true, value: rawValue };
      }
      if (typeof rawValue === "string") {
        const normalized = rawValue.trim().toLowerCase();
        if (normalized === "true") return { ok: true, value: true };
        if (normalized === "false") return { ok: true, value: false };
      }
      return {
        ok: false,
        error: toolError(
          `Invalid value for column "${column.name}" (type checkbox). Expected true/false.`,
        ),
      };
    }

    case "link": {
      if (typeof rawValue === "string") {
        const href = rawValue.trim();
        if (!href) {
          return {
            ok: false,
            error: toolError(
              `Invalid value for column "${column.name}" (type link). Expected a URL string or a link object with href.`,
            ),
          };
        }
        return {
          ok: true,
          value: {
            href,
            pageTitle: href,
          },
        };
      }

      const parsed = linkValueSchema.safeParse(rawValue);
      if (parsed.success) {
        return {
          ok: true,
          value: {
            href: parsed.data.href,
            pageTitle: parsed.data.pageTitle ?? parsed.data.href,
            pageImage: parsed.data.pageImage,
            pageDescription: parsed.data.pageDescription,
          },
        };
      }

      return {
        ok: false,
        error: toolError(
          `Invalid value for column "${column.name}" (type link). Expected a URL string or an object { href, pageTitle? } .`,
        ),
      };
    }

    case "select":
      return normalizeSelectValue({ rawValue, column });

    case "node":
      return normalizeNodeValue({ rawValue, column, ctx });

    default: {
      return {
        ok: false,
        error: toolError(`Unsupported column type for "${column.name}".`),
      };
    }
  }
}
