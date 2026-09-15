import { stripLoneSurrogates } from "./textSanitize";

// Helpers de lecture des métadonnées de chunk (purs, sans `ctx`) : un seul
// endroit, importable depuis les models comme depuis les fonctions
// (importer depuis `searchableChunks.ts` créerait un cycle models ↔ fonctions).

/** Premier titre de section d'un chunk PDF, locateur compact. */
export function getSectionTitleFromMetadata(
  metadata: unknown,
): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const sections = (metadata as { sections?: unknown }).sections;
  if (!Array.isArray(sections) || sections.length === 0) return undefined;
  const first = sections[0];
  if (!first || typeof first !== "object") return undefined;
  const title = (first as { title?: unknown }).title;
  if (typeof title !== "string") return undefined;
  const trimmed = title.trim();
  return trimmed.length > 0 ? stripLoneSurrogates(trimmed) : undefined;
}

/** Numéro de page d'un chunk PDF, si présent et bien typé. */
export function getPageFromMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const maybePage = (metadata as { page?: unknown }).page;
  return typeof maybePage === "number" ? maybePage : undefined;
}

/** Première URL d'image d'un chunk (image / annotation PDF). */
export function getImageUrlFromMetadata(
  metadata: unknown,
): string | undefined {
  return getImageUrlsFromMetadata(metadata)[0];
}

/** Toutes les URLs d'image portées par les métadonnées d'un chunk. */
export function getImageUrlsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];

  const structuredImage = (metadata as { image?: unknown }).image;
  if (structuredImage && typeof structuredImage === "object") {
    const structuredImageUrl = (structuredImage as { url?: unknown }).url;
    if (typeof structuredImageUrl === "string") {
      return [structuredImageUrl];
    }
  }

  const maybeImageUrls = (metadata as { imageUrls?: unknown }).imageUrls;
  if (Array.isArray(maybeImageUrls)) {
    return maybeImageUrls.filter(
      (value): value is string => typeof value === "string",
    );
  }

  const maybeImageUrl = (metadata as { imageUrl?: unknown }).imageUrl;
  return typeof maybeImageUrl === "string" ? [maybeImageUrl] : [];
}
