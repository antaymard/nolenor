/**
 * L'URL sous laquelle une image part vers un modèle de vision.
 *
 * Le coût en tokens d'une image ne dépend QUE de ses dimensions en pixels. Ni
 * le format ni la qualité JPEG n'y changent quoi que ce soit : convertir un PNG
 * de 25 Mo en WebP économise des octets et de la latence, pas un seul token. Et
 * les fournisseurs redimensionnent déjà vers ~1,15 Mpx avant de compter — passer
 * de 4000 px à 1568 px ne fait donc rien non plus. Seul le passage SOUS leur
 * propre plafond économise quelque chose :
 *
 *   ≥1092 px (tel quel) ≈ 1590 tokens
 *   768 px              ≈  790 tokens
 *
 * 768 px n'est défendable que parce que le `VISIBLE_TEXT` de l'indexation part
 * toujours à côté de l'image : les pixels n'ont pas à porter le texte fin, un
 * modèle de vision le lit de toute façon moins bien qu'une passe OCR dédiée.
 *
 * Module sans dépendance, et il doit le rester : `readNodesTool` est importé par
 * `convex/http.ts` via le registre MCP, donc ce fichier finit dans le bundle V8
 * du routeur HTTP. C'est aussi la raison pour laquelle il ne vit pas dans
 * `lib/r2.ts`, qui importe `@aws-sdk/client-s3` au niveau module.
 */

/** Plus grand côté envoyé à un modèle de vision. */
export const MODEL_IMAGE_MAX_EDGE = 768;

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
  // lieu d'être gonflée à 768 et facturée pour des pixels qui n'existent pas.
  const options = `width=${MODEL_IMAGE_MAX_EDGE},fit=scale-down,quality=80,format=auto`;
  return `${base}/cdn-cgi/image/${options}/${key}`;
}
