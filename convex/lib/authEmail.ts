import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { Resend as ResendAPI } from "resend";

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
 * Envoi d'un email d'authentification via l'API Resend.
 *
 * Factorisé parce que le traitement d'erreur est la partie qu'on ne veut pas
 * voir diverger entre les deux providers : sans le `throw`, un échec d'envoi
 * passerait pour un succès et l'utilisateur attendrait un code qui n'arrivera
 * jamais, sans le moindre message.
 */
export async function sendAuthEmail({
  apiKey,
  to,
  subject,
  text,
}: {
  apiKey: string | undefined;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const resend = new ResendAPI(apiKey);

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
