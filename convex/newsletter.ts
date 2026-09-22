import { v } from "convex/values";
import { Resend as ResendAPI } from "resend";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { isProdDeployment } from "./lib/deployment";

/**
 * Segment Resend qui regroupe les inscrits à l'app, et topic sous lequel
 * partent les newsletters produit.
 *
 * Les deux viennent de l'environnement du déploiement
 * (`npx convex env set NEWSLETTER_SEGMENT_ID <id>`), jamais du code : ce sont
 * des identifiants de ressources Resend, qui diffèrent entre un compte de test
 * et le vrai. Absents, l'abonnement est ignoré avec un log — plutôt que d'aller
 * écrire dans le mauvais segment.
 */
function newsletterTargets(): { segmentId: string; topicId: string } | null {
  const segmentId = process.env.NEWSLETTER_SEGMENT_ID;
  const topicId = process.env.NEWSLETTER_TOPIC_ID;
  if (!segmentId || !topicId) return null;
  return { segmentId, topicId };
}

/**
 * Découpe le nom du provider d'auth en prénom / nom.
 *
 * Convex ne stocke qu'un `name` d'un seul tenant (ce que Google renvoie, ou ce
 * que l'utilisateur a saisi), là où Resend veut deux champs pour personnaliser
 * ses emails. Le premier mot fait le prénom, le reste le nom : faux pour les
 * noms composés, mais c'est la seule information disponible et l'erreur se
 * limite à un « Bonjour <prénom> » imparfait.
 */
function splitName(name: string | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const trimmed = name?.trim();
  if (!trimmed) return {};

  const parts = trimmed.split(/\s+/);
  const lastName = parts.slice(1).join(" ");
  return {
    firstName: parts[0],
    ...(lastName ? { lastName } : {}),
  };
}

/**
 * Abonne un nouvel inscrit à la newsletter produit.
 *
 * Interne : planifiée par `afterUserCreatedOrUpdated` (convex/auth.ts) à
 * l'inscription uniquement. Action et non mutation, pour la même raison que
 * `notifyNewSignup` : c'est un appel HTTP sortant, et son échec ne doit ni
 * rouler la création du compte en arrière ni la bloquer.
 *
 * Opt-in automatique assumé, avec le lien de désabonnement que Resend pose dans
 * les emails du topic. Ne lève jamais : un `throw` ferait retenter le scheduler,
 * donc réécrirait le contact en boucle. Les échecs partent en `console.error`.
 */
export const subscribeNewSignup = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if (!isProdDeployment()) {
      console.log(
        `subscribeNewSignup: abonnement ignoré hors prod (SITE_URL=${process.env.SITE_URL ?? "<absent>"}, userId=${userId}).`,
      );
      return null;
    }

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      console.error(
        "subscribeNewSignup: AUTH_RESEND_KEY absente, contact non créé.",
      );
      return null;
    }

    const targets = newsletterTargets();
    if (!targets) {
      console.error(
        "subscribeNewSignup: NEWSLETTER_SEGMENT_ID et/ou NEWSLETTER_TOPIC_ID " +
          "absentes sur ce déploiement, contact non créé. " +
          "`npx convex env set NEWSLETTER_SEGMENT_ID <id>`.",
      );
      return null;
    }

    // Réutilise la query de `adminNotifications` : les deux effets de bord de
    // l'inscription ont besoin des mêmes champs (email, nom), inutile d'en
    // écrire une seconde. Annotation explicite du type, comme là-bas, pour
    // couper la circularité.
    const info: {
      email?: string;
      name?: string;
      creationTime: number;
      providers: string[];
    } | null = await ctx.runQuery(
      internal.adminNotifications.getUserForNotification,
      { userId },
    );
    if (!info) {
      console.error(
        `subscribeNewSignup: utilisateur ${userId} introuvable, contact non créé.`,
      );
      return null;
    }
    if (!info.email) {
      console.error(
        `subscribeNewSignup: utilisateur ${userId} sans email, contact non créé.`,
      );
      return null;
    }

    const email = info.email;
    const topics = [{ id: targets.topicId, subscription: "opt_in" as const }];
    const resend = new ResendAPI(apiKey);

    // Un seul appel : depuis le SDK v6, `contacts.create` accepte segments et
    // topics en même temps que le contact. Les chaîner
    // (`contacts.segments.add`, puis `contacts.topics.update`) laisserait un
    // contact à moitié abonné dès qu'un des appels échoue.
    const { error } = await resend.contacts.create({
      email,
      ...splitName(info.name),
      unsubscribed: false,
      segments: [{ id: targets.segmentId }],
      topics,
    });

    if (!error) {
      console.log(`subscribeNewSignup: contact créé et abonné pour ${email}.`);
      return null;
    }

    // Adresse déjà connue de Resend — réinscription après suppression de
    // compte, ou contact importé à la main. La création échoue, mais
    // l'abonnement reste à faire : segment et topic acceptent l'email comme
    // identifiant, sans avoir à retrouver l'id du contact.
    console.log(
      `subscribeNewSignup: création refusée pour ${email} (${error.message}), ` +
        "tentative de rattachement du contact existant.",
    );

    const segmentResult = await resend.contacts.segments.add({
      email,
      segmentId: targets.segmentId,
    });
    if (segmentResult.error) {
      console.error(
        `subscribeNewSignup: échec d'ajout au segment pour ${email} : ${segmentResult.error.message}`,
      );
    }

    const topicResult = await resend.contacts.topics.update({ email, topics });
    if (topicResult.error) {
      console.error(
        `subscribeNewSignup: échec d'abonnement au topic pour ${email} : ${topicResult.error.message}`,
      );
    }

    return null;
  },
});
