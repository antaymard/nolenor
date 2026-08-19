import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import type { RunMutationCtx } from "@convex-dev/rate-limiter";
import { Resend as ResendAPI } from "resend";
import { enforceRateLimit } from "./rateLimits";

/**
 * Adresse d'expédition des emails d'authentification (code de vérification à
 * l'inscription, code de réinitialisation de mot de passe).
 *
 * Elle vient de l'environnement plutôt que du code : en dev on se contente de
 * `onboarding@resend.dev`, que Resend n'autorise à écrire qu'au propriétaire du
 * compte ; en prod il faut une adresse d'un domaine vérifié chez eux. Deux
 * déploiements, deux valeurs, aucun changement de code.
 *
 * Partagée entre les deux providers OTP plutôt que dupliquée : ils doivent
 * écrire depuis la même adresse, sinon un seul des deux domaines se retrouve
 * vérifié et la moitié des emails part en spam.
 */
export const AUTH_EMAIL_FROM_ADDRESS =
  process.env.AUTH_EMAIL_FROM ?? "Nolenor <onboarding@resend.dev>";

/**
 * Code à usage unique, commun aux deux providers OTP.
 *
 * `crypto.getRandomValues` plutôt que `Math.random` : le code est un secret
 * d'authentification, il doit être imprévisible. `@oslojs/crypto` se charge du
 * tirage sans biais sur l'alphabet (un simple modulo favoriserait les premiers
 * chiffres).
 */
export async function generateAuthOtp(): Promise<string> {
  const random: RandomReader = {
    read(bytes) {
      crypto.getRandomValues(bytes);
    },
  };

  return generateRandomString(random, "0123456789", 8);
}

/**
 * Envoi d'un email d'authentification via l'API Resend, sous quota.
 *
 * Factorisé pour deux raisons. Le traitement d'erreur d'abord : sans le
 * `throw`, un échec d'envoi passerait pour un succès et l'utilisateur
 * attendrait un code qui n'arrivera jamais. Le quota ensuite, qui doit couvrir
 * les deux providers de la même façon — c'est le seul endroit du chemin où on
 * sait qu'un email part réellement.
 *
 * `ctx` est optionnel à dessein : @convex-dev/auth le passe en second argument
 * de `sendVerificationRequest` mais ne le déclare pas dans le type Auth.js
 * (leur implémentation porte un `@ts-expect-error` à cet endroit). Si une
 * version future cessait de le passer, on préfère laisser l'email partir sans
 * quota plutôt que casser toute l'authentification — mais bruyamment, pour que
 * ça se voie dans les logs Convex.
 */
export async function sendAuthEmail({
  ctx,
  to,
  subject,
  text,
}: {
  ctx: RunMutationCtx | undefined;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  if (ctx === undefined) {
    console.error(
      "sendAuthEmail: ctx absent, envoi non soumis au quota. " +
        "@convex-dev/auth a probablement cessé de passer le ctx à " +
        "sendVerificationRequest — vérifier convex/ResendOTP.ts.",
    );
  } else {
    // Clé sur l'adresse visée, en minuscules : c'est la boîte mail qu'on
    // protège, et « A@b.com » ne doit pas ouvrir un second quota.
    await enforceRateLimit(ctx, "authEmailSend", to.toLowerCase());
  }

  const resend = new ResendAPI(process.env.AUTH_RESEND_KEY);

  const { error } = await resend.emails.send({
    from: AUTH_EMAIL_FROM_ADDRESS,
    to: [to],
    subject,
    text,
  });

  if (error) {
    throw new Error(`Could not send authentication email: ${error.message}`);
  }
}

/**
 * Ce dont on a besoin dans `sendVerificationRequest`. Volontairement plus
 * étroit que le type d'Auth.js : moins on dépend de leur forme, moins une
 * montée de version fait mal.
 */
type AuthEmailRequest = { identifier: string; token: string };

/**
 * Rend visible le second argument que la lib passe à `sendVerificationRequest`.
 *
 * Auth.js n'en déclare qu'un ; @convex-dev/auth en passe deux, le ctx Convex en
 * second (`implementation/signIn.js`, avec un `@ts-expect-error` chez eux).
 * Sans ce ctx, pas de quota possible : c'est le seul accès à la base depuis ce
 * point du flux.
 *
 * Le cast est le prix de cet écart entre le type et le runtime. Il est
 * circonscrit ici, et `sendAuthEmail` traite `ctx === undefined` comme un cas
 * légitime au cas où la lib changerait d'avis.
 */
export function withAuthEmailCtx(
  handler: (
    params: AuthEmailRequest,
    ctx: RunMutationCtx | undefined,
  ) => Promise<void>,
): (params: AuthEmailRequest) => Promise<void> {
  return handler as unknown as (params: AuthEmailRequest) => Promise<void>;
}
