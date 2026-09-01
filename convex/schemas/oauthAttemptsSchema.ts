import { v } from "convex/values";

// Une tentative de consentement OAuth en cours, vivante entre le clic sur
// « Connecter » et le retour du provider.
//
// Pourquoi une table plutôt qu'un `state` signé : elle donne l'usage unique
// (la ligne est supprimée à la consommation, donc un `state` rejoué ne vaut
// rien), elle héberge le verifier PKCE — qui, lui, ne peut pas voyager dans le
// state — et elle n'introduit pas un second secret d'environnement à gérer.
const oauthAttemptsValidator = v.object({
  userId: v.id("users"),
  provider: v.string(),
  // Empreinte du nonce transmis dans `state`. Le clair ne vit que dans l'URL
  // remise à l'utilisateur : un accès en lecture à la table ne permet donc pas
  // de forger un retour.
  nonceHash: v.string(),
  // Verifier PKCE, en clair : secret à usage unique, d'une durée de vie de
  // quelques minutes, inutile sans le code d'autorisation qui lui répond.
  // Le chiffrer coûterait un déchiffrement sur le chemin critique du callback
  // sans rien fermer.
  codeVerifier: v.optional(v.string()),
  // Origine sur laquelle rendre la main, déjà validée contre l'allowlist au
  // moment de la création (cf. lib/allowedOrigins).
  returnOrigin: v.string(),
  expiresAt: v.number(),
});

export { oauthAttemptsValidator };
