import { v } from "convex/values";
import { Resend as ResendAPI } from "resend";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

/**
 * Destinataire des notifications d'inscription.
 *
 * Lu depuis la variable d'environnement `ADMIN_EMAIL_ADDRESS` du déploiement
 * (`npx convex env set ADMIN_EMAIL_ADDRESS <adresse>`). Pas de valeur en dur :
 * si elle est absente, l'envoi est ignoré avec un log d'erreur (plutôt qu'un
 * email silencieux vers une mauvaise adresse).
 */
function adminNotificationEmail(): string | null {
  return process.env.ADMIN_EMAIL_ADDRESS ?? null;
}

/**
 * Origines considérées comme de la production pour l'envoi.
 *
 * Miroir d'`ALLOWED_REDIRECT_ORIGINS` dans `convex/auth.ts` : en dev, `SITE_URL`
 * pointe vers la boucle locale et les inscriptions de test ne doivent pas
 * spammer la boîte admin.
 */
const PROD_ORIGINS = ["https://app.nolenor.com", "https://app.nolenor.fr"];

/**
 * Adresse d'expédition, même règle que les emails d'auth
 * (`convex/lib/authEmail.ts`) : `AUTH_EMAIL_FROM` en prod (domaine vérifié
 * chez Resend), repli dev `onboarding@resend.dev`.
 *
 * Dupliquée plutôt qu'importée : `lib/authEmail.ts` tire le rate limiter (conçu
 * pour les mutations), inutile dans cette action.
 */
function notificationFromAddress(): string {
  return process.env.AUTH_EMAIL_FROM ?? "Nolenor <onboarding@resend.dev>";
}

function isProdDeployment(): boolean {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) return false;
  try {
    return PROD_ORIGINS.includes(new URL(siteUrl).origin);
  } catch {
    return false;
  }
}

function formatSignupDate(creationTime: number): string {
  const date = new Date(creationTime);
  let local: string;
  try {
    local = date.toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    local = date.toLocaleString();
  }
  return `${local} (Europe/Paris) — ${date.toISOString()}`;
}

/**
 * Libellé lisible du provider d'inscription.
 *
 * `authAccounts.provider` vaut l'`id` du provider @convex-dev/auth (`google`
 * pour OAuth, `password` pour le mot de passe). Les valeurs inconnues sont
 * renvoyées brutes plutôt que masquées, pour que le debug reste possible si la
 * lib renomme un provider.
 */
function formatProvider(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "password") return "mot de passe";
  return provider;
}

const userInfoValidator = v.object({
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  creationTime: v.number(),
  providers: v.array(v.string()),
});

/**
 * Données nécessaires à l'email admin pour un nouvel inscrit.
 *
 * Interne : lue uniquement par `notifyNewSignup` ci-dessous. Le provider vient
 * de `authAccounts` (index `userIdAndProvider`, préfixe `userId`), pas du
 * document `users` qui ne le stocke pas. `take(5)` : un compte fraîchement créé
 * a une seule ligne, la borne n'est qu'un garde-fou.
 */
export const getUserForNotification = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(userInfoValidator, v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(5);

    return {
      ...(user.email !== undefined ? { email: user.email } : {}),
      ...(user.name !== undefined ? { name: user.name } : {}),
      creationTime: user._creationTime,
      providers: accounts.map((a) => a.provider),
    };
  },
});

/**
 * Envoie l'email admin pour une inscription.
 *
 * Interne : planifiée par `afterUserCreatedOrUpdated` (convex/auth.ts) à
 * l'inscription uniquement (`existingUserId === null`). Action et non mutation :
 * l'envoi est un effet de bord externe (HTTP vers Resend), et un échec ne doit
 * jamais rouler en arrière ni bloquer la création du compte.
 *
 * Ne lève jamais (hors erreurs de validation d'args) : un `throw` ici
 * déclencherait des retries du scheduler et donc des doublons. Les échecs
 * partent en `console.error`, visibles dans les logs Convex.
 */
export const notifyNewSignup = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if (!isProdDeployment()) {
      console.log(
        `notifyNewSignup: envoi ignoré hors prod (SITE_URL=${process.env.SITE_URL ?? "<absent>"}, userId=${userId}).`,
      );
      return null;
    }

    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      console.error(
        "notifyNewSignup: AUTH_RESEND_KEY absente, email admin non envoyé.",
      );
      return null;
    }

    const adminEmail = adminNotificationEmail();
    if (!adminEmail) {
      console.error(
        "notifyNewSignup: ADMIN_EMAIL_ADDRESS absente sur ce déploiement, " +
          "email admin non envoyé. `npx convex env set ADMIN_EMAIL_ADDRESS <adresse>`.",
      );
      return null;
    }

    // Annotation explicite : appel dans le même fichier, contourne la
    // circularité de types (cf. guidelines Convex).
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
        `notifyNewSignup: utilisateur ${userId} introuvable, email admin non envoyé.`,
      );
      return null;
    }

    const email = info.email ?? "<sans email>";
    const providerLabel =
      info.providers.length > 0
        ? info.providers.map(formatProvider).join(", ")
        : "inconnu";
    const dateLabel = formatSignupDate(info.creationTime);

    const resend = new ResendAPI(apiKey);
    const { error } = await resend.emails.send({
      from: notificationFromAddress(),
      to: [adminEmail],
      subject: `Nouvelle inscription Nolenor : ${email}`,
      text: [
        "Nouvelle inscription sur Nolenor.",
        "",
        `Email du compte : ${email}`,
        `Date d'inscription : ${dateLabel}`,
        `Provider : ${providerLabel}`,
        ...(info.name ? [`Nom : ${info.name}`] : []),
      ].join("\n"),
    });

    if (error) {
      console.error(
        `notifyNewSignup: échec d'envoi pour ${email} : ${error.message}`,
      );
      return null;
    }

    console.log(`notifyNewSignup: email admin envoyé pour ${email}.`);
    return null;
  },
});
