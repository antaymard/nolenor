import { useCallback } from "react";
import type { CanvasColor } from "@/../convex/schemas/canvasesSchema";
import { useFileUpload } from "@/hooks/useFilesUpload";

export type CanvasCoverImage = { url: string; key: string };

/**
 * La couverture en cours d'édition. Un fichier choisi n'est uploadé qu'au
 * save (cf. `useCanvasCoverUpload`) : l'aperçu tourne sur une URL locale, et
 * annuler la modale ne laisse pas d'objet orphelin sur R2.
 */
export type CanvasCoverDraft =
  | { kind: "none" }
  | { kind: "stored"; image: CanvasCoverImage }
  | { kind: "file"; file: File; previewUrl: string };

/** Icône et couleur en cours d'édition ; `undefined` = pas de choix. */
export type CanvasIdentityDraft = {
  icon?: string;
  color?: CanvasColor;
};

/** Les types d'image acceptés pour une couverture (le SVG est refusé à
 *  l'upload, cf. `convex/config/uploadsConfig.ts`). */
export const CANVAS_COVER_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/avif";

/** Plafond côté client, bien sous celui du serveur : une couverture s'affiche
 *  en 96px de haut, un 25 Mo n'y gagnerait rien. */
export const MAX_CANVAS_COVER_BYTES = 5 * 1024 * 1024;

export function coverDraftFrom(
  image: CanvasCoverImage | undefined,
): CanvasCoverDraft {
  return image ? { kind: "stored", image } : { kind: "none" };
}

export function coverDraftPreviewUrl(draft: CanvasCoverDraft): string | null {
  if (draft.kind === "stored") return draft.image.url;
  if (draft.kind === "file") return draft.previewUrl;
  return null;
}

/** La couverture a-t-elle changé par rapport à celle enregistrée ? */
export function isCoverDraftDirty(
  draft: CanvasCoverDraft,
  stored: CanvasCoverImage | undefined,
): boolean {
  if (draft.kind === "file") return true;
  if (draft.kind === "none") return stored !== undefined;
  return draft.image.key !== stored?.key;
}

/**
 * Le premier graphème d'une saisie : une icône est un seul emoji, même quand
 * on en colle plusieurs. `Intl.Segmenter` garde entiers les emoji composés
 * (drapeaux, ZWJ, teints) qu'un `Array.from` couperait.
 */
export function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    return first.done ? "" : first.value.segment;
  }
  return Array.from(trimmed)[0] ?? "";
}

/**
 * Transforme un brouillon de couverture en ce qu'attend la mutation :
 * `undefined` si rien n'a changé, `null` pour l'effacer, sinon l'image
 * (uploadée à ce moment-là si c'est un fichier local).
 */
export function useCanvasCoverUpload() {
  const { uploadFile } = useFileUpload();

  return useCallback(
    async (
      draft: CanvasCoverDraft,
      stored: CanvasCoverImage | undefined,
    ): Promise<CanvasCoverImage | null | undefined> => {
      if (!isCoverDraftDirty(draft, stored)) return undefined;
      if (draft.kind === "none") return null;
      if (draft.kind === "stored") return draft.image;
      const uploaded = await uploadFile(draft.file);
      return { url: uploaded.url, key: uploaded.key };
    },
    [uploadFile],
  );
}
