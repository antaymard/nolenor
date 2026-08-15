import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import * as OnboardingModels from "./models/onboardingModels";

/**
 * Provisionne le premier canvas d'un compte fraîchement créé.
 *
 * Déclenchée depuis `afterUserCreatedOrUpdated` (convex/auth.ts), qui est le
 * SEUL endroit capable de dire « c'est une inscription » : côté client, ni
 * `/signin` ni `/` ne le savent plus. L'inscription par mot de passe se
 * termine sur l'étape de vérification d'email (le `step` ne vaut plus
 * "signUp" quand la session s'ouvre), le retour de Google ne repasse pas par
 * `/signin`, et `/` est devenue une vraie page d'accueil où l'on retombe en
 * permanence — y provisionner sur « zéro canvas » recréerait un canvas de
 * tuto à chaque fois qu'on vide sa liste.
 *
 * Interne, et planifiée plutôt qu'appelée en ligne : voir le commentaire du
 * callback dans convex/auth.ts.
 */
export const provisionForNewUser = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await OnboardingModels.provisionFirstCanvasForUser(ctx, {
      authUserId: userId,
    });
    return null;
  },
});
