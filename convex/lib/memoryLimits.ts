import { ConvexError } from "convex/values";

// Limites de taille des memories, mesurées sur `JSON.stringify(entries).length`
// (overhead JSON inclus). Source unique partagée entre le tool IA
// (convex/ia/tools/memoryTool.ts) et les mutations publiques
// (convex/memories.ts) pour éviter toute divergence.
export const MAX_USER_MEMORY_CHARS = 1300;
export const MAX_CANVAS_MEMORY_CHARS = 2500;

export type MemoryTarget = "user" | "canvas";

export function maxCharsFor(target: MemoryTarget): number {
  return target === "user" ? MAX_USER_MEMORY_CHARS : MAX_CANVAS_MEMORY_CHARS;
}

export function formatUsage(currentChars: number, maxChars: number): string {
  const percentage = Math.round((currentChars / maxChars) * 100);
  return `${percentage}% - ${currentChars}/${maxChars} chars`;
}

// Throw (catch côté front) si le contenu sérialisé dépasse la limite.
// Le tool IA retourne un toolError au modèle ; ici on veut une erreur dure
// au save, d'où le throw.
export function assertWithinLimit(
  target: MemoryTarget,
  serialized: string,
): void {
  const maxChars = maxCharsFor(target);
  if (serialized.length > maxChars) {
    throw new ConvexError(
      `Memory at ${serialized.length}/${maxChars} chars: exceeds the limit by ${serialized.length - maxChars} chars. Remove or shorten entries before saving.`,
    );
  }
}
