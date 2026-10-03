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

// Colonnes de table : llmId préfixé. Le "_" colle le préfixe à l'id (même
// classe \w), donc `buildLlmIdTextRegex` n'y trouve aucune frontière de mot
// et ne transforme pas l'id en pill de node quand l'agent l'écrit en clair.
export const COLUMN_ID_PREFIX = "col_";

export function generateColumnId(): string {
  return `${COLUMN_ID_PREFIX}${generateLlmId()}`;
}

// Blocs BlockNote : même convention que les colonnes, pour la même raison.
// Ces ids ne sont pas stockés : ce sont des alias dérivés de l'id réel du bloc,
// montrés à l'agent à la place de l'uuid (cf. convex/lib/blockIdAliases.ts).
export const BLOCK_ID_ALIAS_PREFIX = "b_";

// Nombre de llmIds distincts au format par défaut (lettre, 3 chiffres, lettre,
// 3 chiffres, lettre) : 52³ × 1000² ≈ 1,4·10¹¹, sous 2^53.
const DEFAULT_LLM_ID_SPACE = ALPHA_CHARS.length ** 3 * 1000 ** 2;

/**
 * llmId au format par défaut, déterministe : la même graine donne toujours le
 * même id. `seed` est un entier positif quelconque (typiquement un hash).
 */
export function llmIdFromSeed(seed: number): string {
  let n = Math.floor(Math.abs(seed)) % DEFAULT_LLM_ID_SPACE;
  let value = "";
  for (let i = 0; i < DEFAULT_CHUNK_COUNT; i++) {
    if (i % 2 === 0) {
      value += ALPHA_CHARS[n % ALPHA_CHARS.length];
      n = Math.floor(n / ALPHA_CHARS.length);
    } else {
      value += String(n % 1000).padStart(3, "0");
      n = Math.floor(n / 1000);
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
