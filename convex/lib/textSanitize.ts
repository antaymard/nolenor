// Convex's client-side JSON parser rejects unpaired UTF-16 surrogates, which
// JS strings otherwise allow. These can come from OCR/LLM output, or from
// slicing a string on a code-unit boundary that splits a valid surrogate pair.
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripLoneSurrogates(text: string): string {
  return text.replace(LONE_SURROGATE_RE, "");
}
