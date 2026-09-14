import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as CanvasModels from "./models/canvasModels";
import * as OnboardingModels from "./models/onboardingModels";

/**
 * Ce que `provisionForNewUser` garde sous le coude pour son canvas de repli,
 * retranché du plafond accordé au clonage. Un `insert` de canvas, plus une
 * marge : mieux vaut concéder un poil de budget au clonage que se retrouver
 * sans de quoi écrire la seule chose qu'on promet.
 */
const FALLBACK_DOCS_RESERVE = 4;
const FALLBACK_BYTES_RESERVE = 64 * 1024;

/**
 * Le clonage des canvases de démarrage, isolé dans sa propre transaction.
 *
 * Séparée de `provisionForNewUser` pour une seule raison : avoir le droit
 * d'échouer. Appelée en `ctx.runMutation`, elle s'exécute en
 * SOUS-TRANSACTION — si elle lève, ses écritures sont annulées seules et
 * l'appelante garde les siennes (cf. `_generated/ai/guidelines.md`, Convex
 * 1.41+). C'est ce qui permet de garantir un canvas de repli même quand le
 * clonage explose.
 *
 * Interne, et sans autre appelant que `provisionForNewUser`.
 */
export const cloneStarterCanvases = internalMutation({
  args: { userId: v.id("users") },
  returns: v.array(v.id("canvases")),
  handler: async (ctx, { userId }) => {
    return await OnboardingModels.cloneStarterCanvasesForUser(ctx, {
      authUserId: userId,
    });
  },
});

/**
 * Provisionne les canvases de démarrage d'un compte fraîchement créé, et
 * garantit qu'il en reçoit au moins un.
 *
 * Interne : le seul appelant est `afterUserCreatedOrUpdated` (convex/auth.ts),
 * qui la planifie à l'inscription. Aucun chemin client ne doit la déclencher.
 *
 * Le compte est déjà committé quand cette mutation s'exécute (elle est
 * planifiée en `runAfter` depuis une autre transaction). Tout échouer ici
 * laissait donc un compte sans aucun canvas — pas même le repli, puisqu'il
 * vivait après la boucle de clonage, dans la transaction que l'exception
 * annulait. D'où le découpage : le clonage part en sous-transaction, son
 * échec est rattrapé, et le repli s'écrit ici, dans une transaction intacte.
 */
export const provisionForNewUser = internalMutation({
  args: { userId: v.id("users") },
  returns: v.array(v.id("canvases")),
  handler: async (ctx, { userId }) => {
    // Annotation explicite : `ctx.runMutation` vers une fonction du même
    // fichier casse l'inférence par circularité (cf. guidelines).
    let created: Array<Id<"canvases">> = [];

    // Le plafond est le cœur du correctif, pas un ornement. Sans lui, un
    // clonage trop gros consomme presque tout le budget de transaction AVANT
    // de mourir, et il ne reste pas de quoi écrire le canvas de repli plus bas
    // — soit exactement la panne qu'on corrige. Bridée, la sous-transaction
    // bute sur SON plafond, est annulée seule, et rend la main sur la réserve.
    //
    // Calculé depuis le budget restant plutôt qu'écrit en dur : les limites
    // globales de Convex ne sont pas exposées au code, et une constante devinée
    // au-dessus de la vraie limite ne serrerait rien du tout (un plafond ne
    // peut que restreindre, jamais étendre) — le correctif serait silencieuse-
    // ment inopérant. Ici on réserve ce que coûte UN `insert` de canvas, quelle
    // que soit la limite réelle et quoi qu'elle devienne.
    const budget = await ctx.meta.getTransactionMetrics();

    try {
      created = await ctx.runMutation(
        internal.onboarding.cloneStarterCanvases,
        { userId },
        {
          transactionLimits: {
            documentsWritten: Math.max(
              0,
              budget.documentsWritten.remaining - FALLBACK_DOCS_RESERVE,
            ),
            bytesWritten: Math.max(
              0,
              budget.bytesWritten.remaining - FALLBACK_BYTES_RESERVE,
            ),
          },
        },
      );
    } catch (error) {
      // Le clonage a été annulé seul ; cette transaction-ci est intacte et le
      // repli plus bas va s'écrire. On trace quand même : un jeu de démarrage
      // qui ne part plus est invisible côté utilisateur, qui voit juste un
      // workspace vide.
      console.error("Starter canvas cloning failed", error);
    }

    // Couvre les deux chemins d'un coup : l'exception rattrapée ci-dessus, et
    // le cas nominal où `STARTER_CANVAS_IDS` est absente ou ne résout aucun id.
    //
    // Volontairement SANS `isSystem` : ce canvas ne porte aucun contenu
    // système, c'est un workspace vide identique à celui qu'on obtient en
    // cliquant « Create a workspace ». Le badger induirait l'UI en erreur.
    if (created.length === 0) {
      created = [
        await CanvasModels.createCanvasForUser(ctx, {
          authUserId: userId,
          name: "My first canvas",
        }),
      ];
    }

    return created;
  },
});
