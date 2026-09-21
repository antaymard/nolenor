/**
 * Dérivation de l'URL embarquable d'un node `link` affiché en variante
 * `embed`.
 *
 * `link.href` est la seule value du node : ce qui est stocké est toujours une
 * URL, jamais un snippet HTML — le `src` d'un `<iframe>` collé est extrait à la
 * saisie (`extractIframeSrc`). Tout le reste de la chaîne (métadonnées
 * LinkPreview, résumé Parallel, chunking de recherche) ne voit donc que des
 * URLs et n'a rien à connaître des iframes.
 *
 * L'URL embarquable, elle, n'est jamais stockée : elle se dérive au rendu. Un
 * lien devient un embed par un simple changement de variante, sans réécriture
 * de ses values.
 */

/**
 * Le `src` d'un snippet `<iframe>`, ou `null` si l'entrée n'en est pas un.
 *
 * Beaucoup de sites (Spotify, Figma, Maps…) ne se donnent que sous cette
 * forme : on en garde le `src`, qui EST l'URL embarquable, et on jette
 * l'habillage.
 */
export function extractIframeSrc(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.toLowerCase().includes("<iframe")) return null;
  const match = trimmed.match(/src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || null;
}

/** Préfixe le schéma quand il manque, sans toucher au reste de l'URL. */
function withScheme(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

/**
 * L'URL à donner à l'iframe pour ce `href`.
 *
 * Seules deux familles refusent d'être embarquées telles quelles et sont donc
 * traduites ici : YouTube répond « refused to connect » sur une page `watch`,
 * et Google Docs sur une URL d'édition. Tout le reste passe inchangé — y
 * compris les URLs déjà embarquables, la traduction étant idempotente.
 */
export function deriveEmbedUrl(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return "";

  // Un snippet qui aurait échappé à la normalisation de saisie (écriture de
  // l'agent, value écrite à la main) : le réduire ici plutôt que de poser du
  // HTML dans le `src` d'une iframe.
  const iframeSrc = extractIframeSrc(trimmed);
  if (iframeSrc) return iframeSrc;

  const normalized = withScheme(trimmed);

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return trimmed;
  }

  const host = parsed.hostname.replace(/^(www\.|m\.)/, "");

  if (host === "youtube.com" || host === "youtu.be") {
    if (parsed.pathname.startsWith("/embed/")) return normalized;
    const videoId =
      host === "youtu.be"
        ? parsed.pathname.slice(1)
        : parsed.searchParams.get("v");
    if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    return normalized;
  }

  if (host === "docs.google.com") {
    const path = parsed.pathname;

    const docMatch = path.match(/\/document\/d\/([^/]+)/);
    if (docMatch)
      return `https://docs.google.com/document/d/${docMatch[1]}/preview`;

    const sheetMatch = path.match(/\/spreadsheets\/d\/([^/]+)/);
    if (sheetMatch)
      return `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`;

    const slideMatch = path.match(/\/presentation\/d\/([^/]+)/);
    if (slideMatch)
      return `https://docs.google.com/presentation/d/${slideMatch[1]}/embed`;
  }

  return normalized;
}
