import Resend from "@auth/core/providers/resend";
import {
  AUTH_EMAIL_FROM_ADDRESS,
  generateAuthOtp,
  sendAuthEmail,
} from "./lib/authEmail";

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
  from: AUTH_EMAIL_FROM_ADDRESS,

  generateVerificationToken: generateAuthOtp,

  async sendVerificationRequest({ identifier: email, provider, token }) {
    await sendAuthEmail({
      apiKey: provider.apiKey,
      to: email,
      subject: "Your Nolenor verification code",
      text: [
        `Your verification code is ${token}`,
        "",
        "It expires shortly. If you didn't try to sign in to Nolenor, you can ignore this email.",
      ].join("\n"),
    });
  },
});
