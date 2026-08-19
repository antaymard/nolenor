import Resend from "@auth/core/providers/resend";
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { Resend as ResendAPI } from "resend";

/**
 * L'adresse d'expédition vient de l'environnement plutôt que du code : en dev
 * on se contente de `onboarding@resend.dev` (que Resend n'autorise à écrire
 * qu'au propriétaire du compte), en prod il faut une adresse d'un domaine
 * vérifié chez eux. Deux déploiements, deux valeurs, aucun changement de code.
 */
const FROM_ADDRESS =
  process.env.AUTH_EMAIL_FROM ?? "Nolenor <onboarding@resend.dev>";

/**
 * Code à usage unique envoyé par email pour vérifier une adresse à
 * l'inscription (et à la première connexion des comptes créés avant que la
 * vérification n'existe).
 *
 * Ce n'est pas un raffinement de sécurité optionnel : c'est ce qui rend le
 * provider `Password` « trusted » au sens d'@convex-dev/auth. Sans lui, la doc
 * (docs/advanced.mdx, « Account linking ») classe les comptes mot de passe
 * comme non fiables, et la lib refuse alors de les rattacher à un compte
 * Google portant la même adresse — l'utilisateur se retrouverait avec deux
 * documents `users` et un espace de travail vide. Cf. le commentaire de
 * `convex/auth.ts`.
 */
export const ResendOTP = Resend({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  from: FROM_ADDRESS,

  async generateVerificationToken() {
    // `crypto.getRandomValues` plutôt que `Math.random` : le code est un
    // secret d'authentification, il doit être imprévisible. `@oslojs/crypto`
    // se charge du tirage sans biais sur l'alphabet (un simple modulo
    // favoriserait les premiers chiffres).
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes);
      },
    };

    return generateRandomString(random, "0123456789", 8);
  },

  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [email],
      subject: "Your Nolenor verification code",
      text: [
        `Your verification code is ${token}`,
        "",
        "It expires shortly. If you didn't try to sign in to Nolenor, you can ignore this email.",
      ].join("\n"),
    });

    // Sans ce throw, l'échec d'envoi passerait pour un succès : l'utilisateur
    // attendrait un code qui n'arrivera jamais, sans le moindre message.
    if (error) {
      throw new Error(`Could not send verification email: ${error.message}`);
    }
  },
});
