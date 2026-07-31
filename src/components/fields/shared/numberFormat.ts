import type { TemplateField } from "@/../convex/config/fieldConfig";

function numberUnit(field: TemplateField): string | undefined {
  return typeof field.options?.unit === "string" && field.options.unit.length > 0
    ? field.options.unit
    : undefined;
}

export { numberUnit };
