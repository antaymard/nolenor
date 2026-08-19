import Resend from "@auth/core/providers/resend";
import {
  AUTH_EMAIL_FROM_ADDRESS,
  generateAuthOtp,
  sendAuthEmail,
} from "./lib/authEmail";

/**
 * Code à usage unique envoyé pour réinitialiser un mot de passe oublié.
 *
 * L'`id` diffère volontairement de celui de `ResendOTP`. La doc officielle
 * (config/passwords.mdx) donne `resend-otp` aux deux, mais ses exemples sont
 * pensés comme des alternatives, pas comme une combinaison : ici les deux
 * providers coexistent dans `extraProviders: [config.reset, config.verify]`.
 *
 * Deux raisons de ne pas recopier la doc :
 *   1. La résolution par id est un `find()` : à ids égaux, le reset gagnerait
 *      tous les lookups, y compris ceux du flux de vérification.
 *   2. Surtout, `authVerificationCodes.provider` est le SEUL champ qui
 *      distingue un code de reset d'un code de vérification — `verifyCodeOnly`
 *      compare `verificationCode.provider` au provider de la méthode appelée.
 *      À ids égaux, un code émis pour un flux satisfait l'autre.
 *
 * Les deux codes partent dans la même boîte mail, donc ce n'était pas un
 * franchissement de privilège — mais ça se corrige pour le prix d'une chaîne.
 */
export const ResendOTPPasswordReset = Resend({
  id: "resend-otp-reset",
  apiKey: process.env.AUTH_RESEND_KEY,
  from: AUTH_EMAIL_FROM_ADDRESS,

  generateVerificationToken: generateAuthOtp,

  async sendVerificationRequest({ identifier: email, provider, token }) {
    await sendAuthEmail({
      apiKey: provider.apiKey,
      to: email,
      subject: "Reset your Nolenor password",
      text: [
        `Your password reset code is ${token}`,
        "",
        "It expires shortly. If you didn't ask to reset your Nolenor password, you can ignore this email — your password stays unchanged.",
      ].join("\n"),
    });
  },
});
