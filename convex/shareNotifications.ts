import { v } from "convex/values";
import { Resend as ResendAPI } from "resend";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { resolveUserDisplayName } from "./lib/userDisplayName";

/**
 * Adresse d'expédition, même règle que les emails d'auth
 * (`convex/lib/authEmail.ts`) : `AUTH_EMAIL_FROM` en prod (domaine vérifié
 * chez Resend), repli dev `onboarding@resend.dev`.
 *
 * Dupliquée plutôt qu'importée : `lib/authEmail.ts` tire le rate limiter (conçu
 * pour les mutations), inutile dans cette action.
 */
function shareNotificationFromAddress(): string {
  return process.env.AUTH_EMAIL_FROM ?? "Nolenor <onboarding@resend.dev>";
}

/**
 * Base publique du front, sans slash final. `SITE_URL` est déjà exigée par
 * l'auth (`convex/auth.ts`) : si elle manque ici, on préfère ignorer l'envoi
 * avec un log plutôt que d'envoyer un mail au lien cassé.
 */
function siteBaseUrl(): string | null {
  const raw = process.env.SITE_URL;
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

const shareNotificationDataValidator = v.object({
  canvasName: v.string(),
  sharerName: v.string(),
  recipientEmail: v.string(),
});

/**
 * Données nécessaires au mail de partage.
 *
 * Interne : lue uniquement par `sendCanvasSharedEmail` ci-dessous.
 * Renvoie `null` quand le canvas, le partageur ou le destinataire (ou son
 * email) a disparu entre la mutation et l'envoi — l'action abandonne alors
 * avec un log, sans retry.
 */
export const getShareNotificationData = internalQuery({
  args: {
    canvasId: v.id("canvases"),
    targetUserId: v.id("users"),
    grantedBy: v.id("users"),
  },
  returns: v.union(shareNotificationDataValidator, v.null()),
  handler: async (ctx, { canvasId, targetUserId, grantedBy }) => {
    const canvas = await ctx.db.get("canvases", canvasId);
    if (!canvas) return null;

    const targetUser = await ctx.db.get("users", targetUserId);
    if (!targetUser?.email) return null;

    const sharer = await ctx.db.get("users", grantedBy);

    return {
      canvasName: canvas.name,
      sharerName:
        resolveUserDisplayName(sharer) ?? sharer?.email ?? "Someone",
      recipientEmail: targetUser.email,
    };
  },
});

/**
 * Envoie le mail « canvas partagé avec vous ».
 *
 * Interne : planifiée par `shares.shareCanvas` après l'insert ou la mise à
 * jour de la permission. Action et non envoi direct dans la mutation : l'envoi
 * est un effet de bord externe (HTTP vers Resend), et un échec ne doit jamais
 * rouler en arrière ni bloquer le partage.
 *
 * Ne lève jamais (hors erreurs de validation d'args) : un `throw` ici
 * déclencherait des retries du scheduler et donc des doublons. Les échecs
 * partent en `console.error`, visibles dans les logs Convex.
 */
export const sendCanvasSharedEmail = internalAction({
  args: {
    canvasId: v.id("canvases"),
    targetUserId: v.id("users"),
    grantedBy: v.id("users"),
    permission: v.union(v.literal("viewer"), v.literal("editor")),
    isNew: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { canvasId, targetUserId, grantedBy, permission, isNew }) => {
    const apiKey = process.env.AUTH_RESEND_KEY;
    if (!apiKey) {
      console.error(
        "sendCanvasSharedEmail: AUTH_RESEND_KEY absente, email de partage non envoyé.",
      );
      return null;
    }

    const siteUrl = siteBaseUrl();
    if (!siteUrl) {
      console.error(
        "sendCanvasSharedEmail: SITE_URL absente, email de partage non envoyé " +
          `(canvasId=${canvasId}).`,
      );
      return null;
    }

    // Annotation explicite : appel dans le même fichier, contourne la
    // circularité de types (cf. guidelines Convex).
    const info: {
      canvasName: string;
      sharerName: string;
      recipientEmail: string;
    } | null = await ctx.runQuery(
      internal.shareNotifications.getShareNotificationData,
      { canvasId, targetUserId, grantedBy },
    );
    if (!info) {
      console.error(
        `sendCanvasSharedEmail: canvas, partageur ou destinataire introuvable, email non envoyé (canvasId=${canvasId}).`,
      );
      return null;
    }

    const accessLabel =
      permission === "editor" ? "with edit access" : "with view-only access";
    const subject = isNew
      ? `${info.sharerName} shared "${info.canvasName}" with you`
      : `${info.sharerName} updated your access to "${info.canvasName}"`;
    const canvasUrl = `${siteUrl}/canvas/${canvasId}`;

    const resend = new ResendAPI(apiKey);
    const { error } = await resend.emails.send({
      from: shareNotificationFromAddress(),
      to: [info.recipientEmail],
      subject,
      text: [
        "Hi,",
        "",
        isNew
          ? `${info.sharerName} shared the canvas "${info.canvasName}" with you (${accessLabel}).`
          : `${info.sharerName} updated your access to the canvas "${info.canvasName}" (${accessLabel}).`,
        "",
        `Open it here: ${canvasUrl}`,
        "",
        "If you didn't expect this, you can ignore this email.",
      ].join("\n"),
    });

    if (error) {
      console.error(
        `sendCanvasSharedEmail: échec d'envoi vers ${info.recipientEmail} : ${error.message}`,
      );
      return null;
    }

    console.log(
      `sendCanvasSharedEmail: email de partage envoyé vers ${info.recipientEmail} (canvasId=${canvasId}).`,
    );
    return null;
  },
});
