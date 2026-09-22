/**
 * Origines considérées comme de la production.
 *
 * Miroir d'`ALLOWED_REDIRECT_ORIGINS` dans `convex/auth.ts` : en dev, `SITE_URL`
 * pointe vers la boucle locale.
 */
const PROD_ORIGINS = ["https://app.nolenor.com", "https://app.nolenor.fr"];

/**
 * Le déploiement courant sert-il la production ?
 *
 * Sert de garde à tous les effets de bord qui sortent vers le monde réel depuis
 * une inscription (email admin, abonnement Resend) : les comptes de test créés
 * en dev ne doivent ni spammer une boîte ni polluer la liste de contacts.
 */
export function isProdDeployment(): boolean {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) return false;
  try {
    return PROD_ORIGINS.includes(new URL(siteUrl).origin);
  } catch {
    return false;
  }
}
