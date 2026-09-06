/**
 * La forme des images d'un node "image", et la seule façon de les relire.
 *
 * `values.images` est du `v.any()` : rien ne garantit sa forme au runtime, et le
 * repo la re-devinait jusqu'ici à chaque endroit qui en avait besoin, chacun
 * avec son propre cast et sa propre idée de ce qu'est une entrée valide. Cette
 * divergence est invisible — un lecteur trop strict rend une liste vide, ce qui
 * ressemble exactement à « ce node n'a pas d'image ».
 *
 * Module sans dépendance : le frontend l'importe directement, comme il importe
 * déjà `convex/lib/blockNoteDocument` et `convex/lib/getNodeDataTitle`.
 */

/** Une image telle que stockée dans `values.images` d'un node "image". */
export type StoredImage = {
  url: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: number;
  key?: string;
};

/**
 * Les images d'un node, celles qui ont vraiment une URL exploitable.
 *
 * Une entrée sans `url` utilisable n'est affichable nulle part et ne peut être
 * envoyée à aucun fournisseur : la garder ne ferait que déplacer le problème
 * chez l'appelant.
 */
export function readStoredImages(values: unknown): StoredImage[] {
  const raw = (values as { images?: unknown } | null | undefined)?.images;
  if (!Array.isArray(raw)) return [];

  const images: StoredImage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const image = entry as StoredImage;
    if (typeof image.url !== "string" || image.url.length === 0) continue;
    images.push(image);
  }
  return images;
}
