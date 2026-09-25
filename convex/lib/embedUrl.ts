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
 *
 * Rangé dans `convex/lib` et non `src/lib` parce que le backend s'en sert
 * aussi : la migration qui fusionne les anciens nodes `embed` dans `link` doit
 * réduire les snippets qu'ils avaient stockés tels quels. Le front l'importe
 * via `@/../convex/lib/embedUrl`, comme il le fait déjà de
 * `convex/lib/blockNoteDocument`.
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
 * Seules quelques familles demandent une traduction : YouTube répond
 * « refused to connect » sur une page `watch`, Google Drive sur une page
 * `view`, et les éditeurs Google (Docs, Sheets, Slides) comme Microsoft 365
 * (SharePoint / OneDrive pro) ont une URL dédiée pour l'iframe. Tout le reste
 * passe inchangé — y compris les URLs déjà embarquables, la traduction étant
 * idempotente.
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

  if (host === "docs.google.com") return googleEditorEmbedUrl(parsed);

  if (host === "drive.google.com") {
    // La page `view` d'un fichier Drive (PDF, image, .docx uploadé…) refuse
    // l'iframe ; `preview` est sa visionneuse embarquable.
    const fileMatch = parsed.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([^/]+)/);
    if (fileMatch) {
      const url = new URL(
        `https://drive.google.com/file/d/${fileMatch[1]}/preview`,
      );
      copyParam(parsed, url, "resourcekey");
      return url.toString();
    }
    return normalized;
  }

  if (host.endsWith(".sharepoint.com")) return microsoftEmbedUrl(parsed);

  return normalized;
}

/** Recopie un paramètre de requête s'il est présent. */
function copyParam(from: URL, to: URL, name: string): void {
  const value = from.searchParams.get(name);
  if (value) to.searchParams.set(name, value);
}

/**
 * Docs, Sheets et Slides : l'éditeur complet (`/edit?rm=full`), et non la
 * visionneuse dégradée `/preview`. Google ne bloque pas l'iframe sur `/edit`.
 *
 * Ne s'affiche de façon fiable que pour un fichier partagé « toute personne
 * avec le lien » : l'iframe est tierce, les cookies de session Google n'y
 * passent généralement pas, et un fichier privé tombe sur un mur de connexion.
 */
function googleEditorEmbedUrl(parsed: URL): string {
  const match = parsed.pathname.match(
    /^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([^/]+)/,
  );
  // `/d/e/…` : document publié sur le web (`/pub`, `/pubhtml`), déjà
  // embarquable et dont l'identifiant n'est pas un fileId d'éditeur.
  if (!match || match[2] === "e") return parsed.toString();

  const [, kind, fileId] = match;
  const url = new URL(`https://docs.google.com/${kind}/d/${fileId}/edit`);
  url.searchParams.set("rm", "full");
  // Anciens liens de partage : sans leur `resourcekey`, Google répond 404.
  copyParam(parsed, url, "resourcekey");
  // L'onglet d'un Sheet vit dans le fragment (`#gid=…`).
  url.hash = parsed.hash;
  return url.toString();
}

/**
 * Word, Excel et PowerPoint sur SharePoint / OneDrive pro : Office pour le web
 * rend le fichier en mode embarqué avec `action=embedview`, que ce soit sur
 * une URL `Doc.aspx` ou sur un lien de partage (`/:w:/`, `/:x:/`, `/:p:/`).
 *
 * Comme chez Google, ne s'affiche de façon fiable que pour un lien « toute
 * personne » — souvent désactivé par les tenants. Le OneDrive personnel n'est
 * pas traduit : ses liens (`1drv.ms`) sont des redirections opaques dont
 * l'URL d'embed ne se déduit pas sans les résoudre.
 */
function microsoftEmbedUrl(parsed: URL): string {
  const isOfficeFile =
    /\/:[wxp]:\//.test(parsed.pathname) ||
    /\/_layouts\/15\/Doc\.aspx$/i.test(parsed.pathname);
  if (!isOfficeFile) return parsed.toString();

  const url = new URL(parsed.toString());
  url.searchParams.set("action", "embedview");
  return url.toString();
}
