/**
 * Les trois façons de faire descendre un fichier chez l'utilisateur, selon
 * d'où il vient.
 *
 * Chacun des nœuds porteurs de fichier recopiait la même quinzaine de lignes :
 * `fetch` l'URL publique, en faire un blob, poser une ancre dessus, avec un
 * repli sur une ancre directe. Ça marche pour une image, c'est intenable pour
 * une vidéo — sur 500 Mo le fichier entier passe en mémoire, sans progression,
 * et l'onglet peut y rester. Le chemin normal passe donc désormais par une URL
 * présignée `Content-Disposition: attachment` (cf. `convex/uploads.ts`), que le
 * navigateur télécharge en streaming sans que rien ne transite par le JS.
 */

/** Pose une ancre, la clique, la retire. */
function clickAnchor(href: string, options?: { download?: string }): void {
  const link = document.createElement("a");
  link.href = href;
  if (options?.download !== undefined) link.download = options.download;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Télécharge un contenu fabriqué côté client, qui n'existe nulle part sur le
 * stockage : le code JSX d'un AppNode, le Markdown d'un document.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  try {
    clickAnchor(blobUrl, { download: filename });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Télécharge une URL qu'on ne contrôle pas — typiquement une image fournie par
 * l'agent, qui n'a pas de clé de stockage chez nous.
 *
 * L'ancien chemin, gardé pour ce seul cas : `download` est ignoré en
 * cross-origin, donc sans passer par un blob le navigateur se contenterait
 * d'ouvrir le fichier. Le repli en ancre directe couvre le cas où l'origine
 * distante refuse le `fetch` (CORS) : on n'aura pas le bon nom de fichier,
 * mais l'utilisateur obtient quelque chose.
 */
export async function downloadExternalUrl(
  url: string,
  filename: string,
): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    downloadBlob(await response.blob(), filename);
  } catch (error) {
    console.warn("[downloadFile] fetch failed, falling back to anchor", error);
    clickAnchor(url, { download: filename });
  }
}

/**
 * Télécharge une URL présignée `attachment`.
 *
 * Pas d'attribut `download` : il serait ignoré (l'URL est cross-origin) et
 * c'est de toute façon l'en-tête posé par le serveur qui nomme le fichier.
 */
export function downloadPresignedUrl(url: string): void {
  clickAnchor(url);
}
