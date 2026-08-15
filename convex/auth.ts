import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

// ============================================================================
// REDIRECTION DE RETOUR D'OAUTH
// ============================================================================
// Deux domaines servent la même app, mais `SITE_URL` n'a qu'une valeur par
// déploiement Convex. Sans le callback `redirect` plus bas, un utilisateur
// parti de app.nolenor.fr reviendrait de Google sur app.nolenor.com.
//
// Ce n'est pas qu'une contrariété d'URL : avant de rediriger vers Google, le
// client range le verifier PKCE dans le `localStorage` de l'origine d'où part
// la connexion (`@convex-dev/auth/react`, `storageSet(VERIFIER_STORAGE_KEY)`
// juste avant `window.location.href = …`). Revenir sur une autre origine, c'est
// revenir sans verifier — donc échouer. Le front envoie son origine dans
// `redirectTo`, et c'est ici qu'on décide si on la suit.
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

function siteUrl(): string {
  const value = process.env.SITE_URL;
  if (!value) {
    // La lib l'exige déjà (`requireEnv("SITE_URL")`), mais avec un message qui
    // ne dit pas quoi faire. C'est l'oubli numéro un de cette configuration :
    // le provider Password n'en avait jamais eu besoin.
    throw new Error(
      "SITE_URL n'est pas définie sur ce déploiement Convex. " +
        "`npx convex env set SITE_URL <url du front>`.",
    );
  }
  return value.replace(/\/$/, "");
}

function isAllowedOrigin(origin: string): boolean {
  const deploymentOrigin = new URL(siteUrl()).origin;
  if (origin === deploymentOrigin) return true;
  if (ALLOWED_REDIRECT_ORIGINS.includes(origin)) return true;
  return LOOPBACK_ORIGIN.test(deploymentOrigin) && LOOPBACK_ORIGIN.test(origin);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    // `verify` n'est pas un confort : il décide du rattachement des comptes.
    //
    // @convex-dev/auth classe les méthodes en « trusted » ou non selon qu'elles
    // prouvent la possession de l'adresse (docs/advanced.mdx, « Account
    // linking »). Google l'est d'office ; un `Password` sans vérification ne
    // l'est pas. Or la lib refuse de rattacher un compte OAuth à un utilisateur
    // dont l'email n'est pas vérifié : sans `verify`, quelqu'un qui s'est
    // inscrit par mot de passe puis se connecte avec Google sur la même adresse
    // obtiendrait un SECOND document `users`, vide, et croirait avoir perdu ses
    // canvas. Avec `verify`, les deux méthodes sont fiables, et la liaison se
    // fait par le mécanisme natif — sans callback `createOrUpdateUser` custom,
    // qui obligerait à réimplémenter la création d'utilisateur pour tous les
    // providers.
    //
    // Les comptes créés avant ce changement n'ont pas de `emailVerified` sur
    // leur ligne `authAccounts` : le provider les envoie donc vers la
    // vérification à leur prochaine connexion, et ils deviennent fiables sans
    // qu'on ait à migrer quoi que ce soit en base.
    // `reset` est le pendant obligé de `verify` : sans lui, un utilisateur qui
    // oublie son mot de passe n'a aucun recours, et l'inscription par mot de
    // passe devient un piège. Il réutilise la même machinerie OTP, avec un
    // provider distinct pour que les deux sortes de codes ne se confondent pas
    // (cf. le commentaire d'`id` dans ResendOTPPasswordReset).
    //
    // Effet de bord utile : réinitialiser son mot de passe marque aussi
    // l'adresse comme vérifiée, donc c'est un second chemin pour qu'un vieux
    // compte jamais vérifié devienne fusionnable avec Google.
    Password({ verify: ResendOTP, reset: ResendOTPPasswordReset }),

    Google({
      profile(googleProfile) {
        // `email_verified` est une claim de l'ID token que le `profile()` par
        // défaut d'@auth/core laisse tomber. Sans elle, la lib se rabat sur
        // « un provider OAuth est fiable par principe ». C'est vrai pour un
        // compte Google ordinaire, mais un compte Workspace peut porter une
        // adresse non vérifiée — et c'est précisément sur cette confiance que
        // repose le rattachement à un compte mot de passe existant. Autant
        // décider sur la claim réelle plutôt que sur une hypothèse.
        //
        // Objet nommé plutôt que littéral rendu directement : le type `User`
        // d'@auth/core ne déclare pas `emailVerified`, et le contrôle des
        // propriétés excédentaires de TypeScript ne s'applique qu'aux
        // littéraux frais.
        const profile = {
          id: googleProfile.sub,
          name: googleProfile.name,
          email: googleProfile.email,
          image: googleProfile.picture,
          emailVerified: googleProfile.email_verified === true,
        };
        return profile;
      },
    }),
  ],

  callbacks: {
    /**
     * Provisionne le premier canvas d'un compte qui vient d'être créé.
     *
     * `existingUserId === null` signifie exactement « une ligne `users` vient
     * d'être insérée » (cf. `implementation/users.js`) : c'est le seul signal
     * d'inscription fiable de l'app, et il vaut pour Google comme pour le mot
     * de passe. Le client, lui, ne peut plus le produire — l'inscription par
     * mot de passe se termine sur l'étape de vérification d'email et le retour
     * de Google ne repasse pas par `/signin`.
     *
     * Planifié plutôt qu'exécuté ici : ce callback tourne DANS la transaction
     * d'inscription. Y cloner un canvas entier la ferait grossir de tous les
     * `nodeDatas` du tuto, et surtout la moindre erreur de clonage ferait
     * échouer la création du compte. Un `runAfter(0, …)` isole les deux : au
     * pire le canvas manque, et la home affiche son écran de bienvenue, qui
     * sait déjà en créer un.
     */
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId !== null) return;

      await ctx.scheduler.runAfter(
        0,
        internal.onboarding.provisionForNewUser,
        { userId },
      );
    },

    /**
     * Où renvoyer l'utilisateur une fois Google passé.
     *
     * Ce callback REMPLACE `defaultRedirectCallback`, qui est le seul contrôle
     * que la lib exerce sur `redirectTo` — `redirectAbsoluteUrl` ne valide
     * rien de son côté dès qu'un callback custom est fourni. L'allowlist
     * ci-dessous est donc notre unique protection contre l'open redirect, et
     * elle n'est pas décorative : le code d'échange OAuth voyage en paramètre
     * de query de la destination. Qui obtient la redirection obtient le code,
     * et donc la session.
     */
    async redirect({ redirectTo }) {
      // `//exemple.com` est une URL protocol-relative déguisée en chemin : la
      // traiter comme un chemin la ferait passer pour interne.
      if (redirectTo.startsWith("//")) {
        throw new Error(`redirectTo invalide : ${redirectTo}`);
      }

      // Chemin ou query seuls : résolus sur le domaine du déploiement, comme
      // le faisait l'implémentation par défaut.
      if (redirectTo.startsWith("/") || redirectTo.startsWith("?")) {
        return `${siteUrl()}${redirectTo}`;
      }

      let url: URL;
      try {
        url = new URL(redirectTo);
      } catch {
        throw new Error(`redirectTo invalide : ${redirectTo}`);
      }

      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error(`Protocole de redirectTo refusé : ${redirectTo}`);
      }
      if (!isAllowedOrigin(url.origin)) {
        throw new Error(`Origine de redirectTo non autorisée : ${url.origin}`);
      }

      return url.toString();
    },
  },
});
