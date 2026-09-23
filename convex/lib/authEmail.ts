import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import type { RunMutationCtx } from "@convex-dev/rate-limiter";
import { Resend as ResendAPI } from "resend";
import { AUTH_OTP_LENGTH } from "./authOtp";
import { enforceRateLimit } from "./rateLimits";
import { escapeXmlText } from "./xml";

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

  return generateRandomString(random, "0123456789", AUTH_OTP_LENGTH);
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
  content,
}: {
  ctx: RunMutationCtx | undefined;
  to: string;
  subject: string;
  content: AuthCodeEmailContent;
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
    text: renderAuthCodeEmailText(content),
    html: renderAuthCodeEmailHtml(content),
  });

  if (error) {
    throw new Error(`Could not send authentication email: ${error.message}`);
  }
}

/**
 * Contenu d'un email de code : le même pour la version texte et la version
 * HTML, pour que les deux ne divergent pas au fil des retouches.
 */
export type AuthCodeEmailContent = {
  heading: string;
  intro: string;
  code: string;
  footer: string;
};

/**
 * Version texte, pour les clients qui n'affichent pas le HTML. Le code est
 * seul sur sa ligne : un double-clic le sélectionne sans ramasser de
 * ponctuation autour.
 */
function renderAuthCodeEmailText({
  heading,
  intro,
  code,
  footer,
}: AuthCodeEmailContent): string {
  return [heading, "", intro, "", code, "", footer].join("\n");
}

const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const EMAIL_CODE_FONT_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";
const EMAIL_CODE_LETTER_SPACING_PX = 8;

/**
 * Version HTML : le code en très gros, au centre, dans un encart.
 *
 * Contraintes des clients mail, qui expliquent la forme :
 *   - mise en page en `<table>` et styles inline : Gmail retire les `<style>`
 *     dans certains contextes, Outlook ignore flexbox ;
 *   - pas de logo : le SVG du site n'est pas rendu par Gmail, et une image
 *     distante est souvent bloquée par défaut — un code qu'on ne voit pas
 *     derrière une image cassée serait pire que pas d'image ;
 *   - chiffres espacés par `letter-spacing` et non par des espaces : le texte
 *     reste un seul mot, donc un double-clic ou un appui long le copie en
 *     entier, sans espaces qui feraient échouer le collage. `user-select: all`
 *     (Apple Mail, clients web) le sélectionne même d'un simple clic ;
 *   - `padding-left` égal au `letter-spacing` : l'espacement s'ajoute aussi
 *     après le dernier chiffre, ce qui décentrerait le code sinon.
 *
 * Un texte de prévisualisation caché (« preheader ») porte le code, pour
 * qu'il apparaisse dans la liste des messages avant même l'ouverture.
 */
function renderAuthCodeEmailHtml({
  heading,
  intro,
  code,
  footer,
}: AuthCodeEmailContent): string {
  const safeCode = escapeXmlText(code);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${escapeXmlText(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f7f7f8;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your code: ${safeCode}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f7f8;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
            <tr>
              <td style="padding:36px 32px;font-family:${EMAIL_FONT_STACK};color:#111827;">
                <p style="margin:0;font-size:15px;font-weight:700;color:#3b82f6;">Nolenor</p>
                <h1 style="margin:24px 0 8px;font-size:22px;line-height:1.3;font-weight:700;color:#111827;">${escapeXmlText(heading)}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#4b5563;">${escapeXmlText(intro)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="padding:24px 12px;background-color:#f3f4f6;border-radius:12px;">
                      <span style="display:inline-block;padding-left:${EMAIL_CODE_LETTER_SPACING_PX}px;font-family:${EMAIL_CODE_FONT_STACK};font-size:40px;line-height:1;font-weight:700;letter-spacing:${EMAIL_CODE_LETTER_SPACING_PX}px;color:#111827;-webkit-user-select:all;user-select:all;">${safeCode}</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">${escapeXmlText(footer)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
