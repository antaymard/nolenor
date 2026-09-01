import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";
import { isAllowedOrigin, siteUrl } from "./lib/allowedOrigins";

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
//
// L'allowlist elle-même vit dans `lib/allowedOrigins` : le flux OAuth des
// intégrations (cf. `connections.ts`) fait le même aller-retour et doit être
// gardé par la même liste, pas par une copie qui divergera.

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
