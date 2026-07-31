import type { TemplateField } from "@/../convex/config/fieldConfig";

function shortTextPlaceholder(field: TemplateField): string {
  return typeof field.options?.placeholder === "string" &&
    field.options.placeholder.length > 0
    ? field.options.placeholder
    : field.name;
}

export { shortTextPlaceholder };
