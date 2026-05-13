const ALPHA_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DEFAULT_CHUNK_COUNT = 5;

function assertValidChunkCount(chunkCount: number): void {
  if (!Number.isInteger(chunkCount) || chunkCount < 1) {
    throw new Error("chunkCount must be an integer greater than 0");
  }
}

function buildLlmIdPattern(chunkCount: number): string {
  assertValidChunkCount(chunkCount);
  let pattern = "";
  for (let i = 0; i < chunkCount; i++) {
    if (i % 2 === 0) {
      pattern += "[A-Za-z]";
    } else {
      pattern += "\\d{3}";
    }
  }
  return pattern;
}

function randomLetter(): string {
  return ALPHA_CHARS[Math.floor(Math.random() * ALPHA_CHARS.length)];
}

function random3Digits(): string {
  return String(Math.floor(Math.random() * 1000)).padStart(3, "0");
}

export function generateLlmId(
  chunkCount: number = DEFAULT_CHUNK_COUNT,
): string {
  assertValidChunkCount(chunkCount);

  let value = "";
  for (let i = 0; i < chunkCount; i++) {
    if (i % 2 === 0) {
      value += randomLetter();
    } else {
      value += random3Digits();
    }
  }
  return value;
}

export function matchesLlmIdFormat(
  value: string,
  chunkCount: number = DEFAULT_CHUNK_COUNT,
): boolean {
  // Vérifie le format courant strict (a000a000a...)
  const currentRegex = new RegExp(`^${buildLlmIdPattern(chunkCount)}$`);
  if (currentRegex.test(value)) return true;

  // Rétrocompatibilité : minimum 2 chunks pour éviter les faux positifs (ex: "100k", "abc1")
  const legacyRegex1 = /^(?:\d{3}[A-Za-z]){2,}$/;
  const legacyRegex2 = /^(?:[A-Za-z]{3}\d){2,}$/;
  return legacyRegex1.test(value) || legacyRegex2.test(value);
}

// Regex capturant les LLM IDs dans un texte arbitraire. Exporté pour que
// les composants de rendu utilisent exactement le même filtre que le matcher.
// Minimum 2 répétitions par alternative pour éviter de matcher "100k", "abc1", etc.
export function buildLlmIdTextRegex(): RegExp {
  return /\b((?:\d{3}[A-Za-z]){2,}|(?:[A-Za-z]{3}\d){2,}|[A-Za-z](?:\d{3}[A-Za-z]){2,})\b/g;
}

export function matchLlmIdsInText(
  text: string,
  chunkCount: number = DEFAULT_CHUNK_COUNT,
): string[] {
  const matches = text.match(buildLlmIdTextRegex()) ?? [];

  return [...new Set(matches)].filter((value) =>
    matchesLlmIdFormat(value, chunkCount),
  );
}
