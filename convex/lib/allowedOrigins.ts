// ============================================================================
// ORIGINES DE RETOUR AUTORISÉES
// ============================================================================
// Deux domaines servent la même app, mais `SITE_URL` n'a qu'une valeur par
// déploiement Convex. Tout aller-retour qui quitte l'app pour y revenir —
// connexion Google, consentement OAuth d'une intégration — doit donc décider
// lui-même de l'origine sur laquelle il rend la main.
//
// Ce n'est pas une contrariété d'URL : ce qui voyage au retour est un code
// d'échange OAuth, en paramètre de query. Qui obtient la redirection obtient le
// code. Cette allowlist est l'unique protection contre l'open redirect des deux
// flux, d'où sa vie ici plutôt qu'en double dans chacun.
const ALLOWED_REDIRECT_ORIGINS = [
  "https://app.nolenor.com",
  "https://app.nolenor.fr",
];

// En dev, le front tourne sur un port que Vite choisit (5173, ou 5174 s'il est
// pris) : les figer ferait casser la connexion au premier port occupé. On
// accepte donc n'importe quel port de la boucle locale, mais seulement quand le
// déploiement lui-même est local. En prod, `http://localhost` resterait une
// destination exfiltrable pour qui fait tourner un serveur sur la machine de la
// victime.
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function siteUrl(): string {
  const value = process.env.SITE_URL;
  if (!value) {
    // La lib d'auth l'exige déjà (`requireEnv("SITE_URL")`), mais avec un
    // message qui ne dit pas quoi faire. C'est l'oubli numéro un de cette
    // configuration : le provider Password n'en avait jamais eu besoin.
    throw new Error(
      "SITE_URL n'est pas définie sur ce déploiement Convex. " +
        "`npx convex env set SITE_URL <url du front>`.",
    );
  }
  return value.replace(/\/$/, "");
}

export function isAllowedOrigin(origin: string): boolean {
  const deploymentOrigin = new URL(siteUrl()).origin;
  if (origin === deploymentOrigin) return true;
  if (ALLOWED_REDIRECT_ORIGINS.includes(origin)) return true;
  return LOOPBACK_ORIGIN.test(deploymentOrigin) && LOOPBACK_ORIGIN.test(origin);
}

/**
 * Origine de retour d'un flux OAuth, validée. Rend `siteUrl()` quand l'origine
 * proposée est absente ou refusée — un flux ne doit pas échouer parce que le
 * front s'est mal annoncé, il doit revenir sur le domaine canonique.
 */
export function resolveReturnOrigin(candidate: string | undefined): string {
  const fallback = new URL(siteUrl()).origin;
  if (!candidate) return fallback;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return fallback;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;

  return isAllowedOrigin(url.origin) ? url.origin : fallback;
}
