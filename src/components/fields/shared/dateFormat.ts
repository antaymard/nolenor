// Stockage en ISO date ("YYYY-MM-DD") — cf. convex/config/fieldConfig.

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseIsoDate(value: unknown): Date | undefined {
  const iso = typeof value === "string" && value.length > 0 ? value : undefined;
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatAbsoluteDate(value: unknown): string | undefined {
  const date = parseIsoDate(value);
  if (!date) return undefined;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export { toIsoDate, parseIsoDate, formatAbsoluteDate };
