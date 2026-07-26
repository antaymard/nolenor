// Value : { url, key? } | null — `key` uniquement pour les uploads R2
// (cascade de suppression) ; les URLs externes posées par l'agent n'en ont
// pas.

type ImageValue = { url: string; key?: string };

function parseImageValue(value: unknown): ImageValue | null {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as ImageValue).url === "string" &&
    (value as ImageValue).url.length > 0
  ) {
    return value as ImageValue;
  }
  return null;
}

export { parseImageValue };
export type { ImageValue };
