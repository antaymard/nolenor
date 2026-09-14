/**
 * L'URL sous laquelle une image part vers un modèle de vision.
 *
 * Le coût en tokens d'une image ne dépend QUE de ses dimensions en pixels : ni le
 * format ni la qualité JPEG n'y changent quoi que ce soit — convertir un PNG de
 * 25 Mo en WebP économise des octets et de la latence, pas un seul token. Et les
 * fournisseurs redimensionnent déjà toute image au-dessus de leur plafond avant
 * de compter, donc passer de 4000 px à 1568 px ne fait rien non plus. Seul le
 * passage SOUS ce plafond économise encore quelque chose.
 *
 * Mais COMBIEN dépend entièrement de l'encodeur du modèle, et il n'est pas
 * connaissable depuis ici — tout passe par OpenRouter, qui route vers ce qu'il
 * veut. Trois comportements existent, et ils ne se ressemblent pas :
 *
 *   • comptage continu (Anthropic, ~1380 tokens/Mpx) → 768 px gagne ~50 %
 *   • tuiles de 768×768 (Gemini, 258 tokens/tuile)   → 768 px gagne jusqu'à 4×
 *   • tuiles de 512×512 (OpenAI, 170 tokens/tuile)   → 768 px gagne ZÉRO :
 *     il occupe 2×2 tuiles, exactement comme 1024 px
 *
 * D'où le défaut désactivé, et `R2_IMAGE_MAX_EDGE` pour ajuster : la bonne
 * valeur se mesure sur `aiUsageEvents` avec le modèle réellement servi, elle ne
 * se déduit pas.
 *
 * 768 px est le défaut parce que c'est l'optimum en tokens sur les trois familles
 * ci-dessus. Ce n'est PAS l'optimum en qualité : le `VISIBLE_TEXT` de
 * l'indexation part toujours à côté de l'image, donc les pixels n'ont pas à
 * porter le texte fin — mais ils portent encore le détail visuel (une marque
 * discrète, une nuance de couleur, la position d'un point sur un graphe), et
 * c'est souvent pour ça qu'on attache une image plutôt que de lire sa
 * description. Monter la valeur est un arbitrage légitime.
 *
 * Module sans dépendance, et il doit le rester : `readNodesTool` est importé par
 * `convex/http.ts` via le registre MCP, donc ce fichier finit dans le bundle V8
 * du routeur HTTP. C'est aussi la raison pour laquelle il ne vit pas dans
 * `lib/r2.ts`, qui importe `@aws-sdk/client-s3` au niveau module.
 */

/** Plus grand côté envoyé à un modèle de vision, sauf `R2_IMAGE_MAX_EDGE`. */
export const DEFAULT_MODEL_IMAGE_MAX_EDGE = 768;

/** Au-delà, le plafond du fournisseur reprend la main : régler plus haut ne fait rien. */
const MAX_CONFIGURABLE_EDGE = 4096;

/**
 * Le plus grand côté demandé à Cloudflare.
 *
 * Une valeur illisible retombe sur le défaut plutôt que de produire un
 * `width=abc` que Cloudflare refuserait : une faute de frappe dans une variable
 * d'env ne doit pas casser toutes les images de l'app.
 */
function readMaxEdge(): number {
  const raw = process.env.R2_IMAGE_MAX_EDGE;
  if (!raw) return DEFAULT_MODEL_IMAGE_MAX_EDGE;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_MODEL_IMAGE_MAX_EDGE;
  }
  return Math.min(parsed, MAX_CONFIGURABLE_EDGE);
}

/**
 * Réécrit une URL R2 en URL Cloudflare Image Transformations, si et seulement
 * si le déploiement l'a explicitement activé.
 *
 * Pas d'auto-détection possible : quand les transformations ne sont pas activées
 * sur la zone, `/cdn-cgi/image/...` répond 404 — les images casseraient
 * silencieusement chez tous ceux qui forkent sans le configurer. D'où l'opt-in,
 * et le repli sur l'URL d'origine pour tout le reste.
 *
 * `process.env` est lu DANS la fonction, comme `lib/r2Keys.ts` : au niveau
 * module, la valeur serait figée au bundling.
 */
export function toModelImageUrl(url: string): string {
  if (process.env.R2_IMAGE_TRANSFORM !== "cloudflare") return url;

  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) return url;

  // Le domaine public R2 est un domaine personnalisé, donc une zone Cloudflare :
  // la forme chemin-relatif suffit, et on n'a pas à autoriser les origines
  // distantes. Une URL qui n'en vient pas (résultat de websearch, URL externe
  // écrite par l'agent via set_node_data) n'est pas la nôtre et passe intacte.
  const base = publicUrl.endsWith("/") ? publicUrl.slice(0, -1) : publicUrl;
  const prefix = `${base}/`;
  if (!url.startsWith(prefix)) return url;

  const key = url.slice(prefix.length);
  if (key.length === 0) return url;

  // `fit=scale-down` n'agrandit jamais : une image de 400 px reste à 400 px au
  // lieu d'être gonflée et facturée pour des pixels qui n'existent pas.
  const options = `width=${readMaxEdge()},fit=scale-down,quality=80,format=auto`;
  return `${base}/cdn-cgi/image/${options}/${key}`;
}
