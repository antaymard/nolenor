import { profiles as appProfiles } from "../ia/profiles";
import type { Profile } from "./types";

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

/** Pour les tests : un profil à modèle factice et tools jouets. */
export function registerProfile(profile: Profile): void {
  registry.set(profile.name, profile);
}
