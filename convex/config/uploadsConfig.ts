/**
 * Politique d'upload R2.
 *
 * Avant ça, `generateUploadUrl` acceptait `mimeType: v.string()` et le passait
 * tel quel dans le `ContentType` de l'URL présignée. Comme le bucket est servi
 * sur un domaine qu'on contrôle, n'importe quel client authentifié pouvait y
 * déposer du `text/html` ou du SVG scripté et obtenir un XSS stocké sur notre
 * propre domaine. Il n'y avait par ailleurs aucune borne de taille : rien
 * n'empêchait un objet de plusieurs Go.
 *
 * Deux verrous ici :
 *  - une allowlist de types (les types rendus comme du HTML par le navigateur
 *    sont exclus, SVG compris) ;
 *  - un `Content-Disposition: attachment` sur tout ce qu'on n'affiche pas
 *    nous-mêmes, pour que même un type mal classé ne s'exécute pas dans
 *    l'origine du bucket.
 *
 * Les tailles sont signées dans l'URL présignée (cf. `lib/r2.ts`), donc R2 les
 * fait respecter : elles ne sont pas seulement déclaratives.
 */

const MB = 1024 * 1024;

/** Un seul appel ne peut pas frapper des URLs présignées à l'infini. */
export const MAX_UPLOAD_FILES_PER_REQUEST = 20;

export type UploadDisposition = "inline" | "attachment";

export interface UploadPolicy {
  maxBytes: number;
  disposition: UploadDisposition;
}

/**
 * Types explicitement refusés même s'ils tombent dans une famille autorisée.
 * Le SVG est un document XML qui peut porter du script : il n'a rien à faire
 * dans `image/*` côté sécurité.
 */
const BLOCKED_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/svg",
  "text/html",
  "application/xhtml+xml",
]);

/** Familles affichées directement par l'app (nœuds image / audio / vidéo). */
const FAMILY_POLICIES: Array<{ prefix: string; policy: UploadPolicy }> = [
  { prefix: "image/", policy: { maxBytes: 25 * MB, disposition: "inline" } },
  { prefix: "audio/", policy: { maxBytes: 200 * MB, disposition: "inline" } },
  { prefix: "video/", policy: { maxBytes: 500 * MB, disposition: "inline" } },
];

/**
 * Types unitaires. Tout ce qui n'est pas rendu par l'app part en
 * `attachment` : le navigateur le télécharge au lieu de l'interpréter.
 */
const EXACT_POLICIES: Record<string, UploadPolicy> = {
  "application/pdf": { maxBytes: 100 * MB, disposition: "inline" },

  "text/plain": { maxBytes: 25 * MB, disposition: "attachment" },
  "text/csv": { maxBytes: 25 * MB, disposition: "attachment" },
  "text/markdown": { maxBytes: 25 * MB, disposition: "attachment" },
  "application/json": { maxBytes: 25 * MB, disposition: "attachment" },
  "application/xml": { maxBytes: 25 * MB, disposition: "attachment" },
  "text/xml": { maxBytes: 25 * MB, disposition: "attachment" },

  "application/msword": { maxBytes: 100 * MB, disposition: "attachment" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    maxBytes: 100 * MB,
    disposition: "attachment",
  },
  "application/vnd.ms-excel": { maxBytes: 100 * MB, disposition: "attachment" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    maxBytes: 100 * MB,
    disposition: "attachment",
  },
  "application/vnd.ms-powerpoint": {
    maxBytes: 100 * MB,
    disposition: "attachment",
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    maxBytes: 100 * MB,
    disposition: "attachment",
  },

  "application/zip": { maxBytes: 200 * MB, disposition: "attachment" },
  "application/x-rar-compressed": {
    maxBytes: 200 * MB,
    disposition: "attachment",
  },
  "application/x-7z-compressed": {
    maxBytes: 200 * MB,
    disposition: "attachment",
  },
};

/**
 * Politique applicable à un type MIME, ou `null` s'il est refusé.
 * Le paramètre de type (`; charset=utf-8`) est ignoré pour la décision mais
 * l'appelant doit signer le type normalisé retourné par `normalizeMimeType`.
 */
export function resolveUploadPolicy(mimeType: string): UploadPolicy | null {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return null;
  if (BLOCKED_MIME_TYPES.has(normalized)) return null;

  const exact = EXACT_POLICIES[normalized];
  if (exact) return exact;

  for (const { prefix, policy } of FAMILY_POLICIES) {
    if (normalized.startsWith(prefix)) return policy;
  }

  return null;
}

/** `image/png; charset=binary` -> `image/png`. Chaîne vide si non parsable. */
export function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0].trim().toLowerCase();
}
