import { profiles as appProfiles } from "../ia/profiles";
import type { Profile, RunInfo } from "./types";

/**
 * Le registre des profils. Les profils de l'app sont fournis par
 * `ia/profiles` ; c'est le seul point où le kernel voit l'app.
 */
const registry = new Map<string, Profile>(
  Object.values(appProfiles).map((profile) => [profile.name, profile]),
);

export function getProfile(name: string): Profile {
  const profile = registry.get(name);
  if (!profile) throw new Error(`Unknown agent profile "${name}".`);
  return profile;
}

/**
 * Budget de l'historique qui précède le run : 80 % de la fenêtre du modèle.
 * Un filet de sécurité — la compaction de fin de run passe bien avant. Le
 * même pour une génération et pour le résumé in-cache, dont le préfixe doit
 * être identique.
 */
export function historyBudget(
  profile: Profile,
  run: RunInfo,
): number | undefined {
  if (!profile.compaction) return undefined;
  return Math.floor(profile.compaction.contextWindow(run) * 0.8);
}

/** Pour les tests : un profil à modèle factice et tools jouets. */
export function registerProfile(profile: Profile): void {
  registry.set(profile.name, profile);
}
