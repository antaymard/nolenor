import { noleProfile } from "./nole";
import { workerProfile } from "./worker";

/** Les profils d'agent de l'app, exécutés par la harness (convex/harness). */
export const profiles = {
  nole: noleProfile,
  worker: workerProfile,
};
