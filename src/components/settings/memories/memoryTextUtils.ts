// Conversion entre le stockage (`content` = JSON.stringify(string[])) et
// l'édition (`textarea` simple, une ligne = une entrée). Même tolérance que
// le tool IA (convex/ia/tools/memoryTool.ts:parseEntries) : JSON invalide ou
// non-tableau -> liste vide, non-strings filtrées.
export function parseEntries(rawContent?: string | null): string[] {
  if (!rawContent) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function entriesToText(entries: string[]): string {
  return entries.join("\n");
}

// Split lignes, trim, filtre les lignes vides. Les lignes vides ne sont pas
// des memories : elles ne comptent pas dans la limite.
export function textToEntries(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
