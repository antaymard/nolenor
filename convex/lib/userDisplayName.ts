import type { Doc } from "../_generated/dataModel";

/**
 * Nom sous lequel s'adresser à un utilisateur, en un seul endroit.
 *
 * Deux cases distinctes dans le document user, par ordre de priorité :
 *   1. `displayName` — celui que l'utilisateur s'est donné (Settings → Account).
 *   2. `name` — celui que le provider d'auth a posé à l'inscription, qu'il
 *      réécrit à chaque connexion pour un provider OAuth (cf. le commentaire
 *      de la table `users` dans schema.ts).
 *
 * Renvoie `null` plutôt qu'une chaîne vide quand aucun des deux n'est
 * exploitable : les appelants doivent traiter « pas de nom » comme un cas à
 * part, pas comme un nom qui se trouve être vide.
 */
export function resolveUserDisplayName(
  user: Pick<Doc<"users">, "displayName" | "name"> | null | undefined,
): string | null {
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName;

  const providerName = user?.name?.trim();
  if (providerName) return providerName;

  return null;
}
