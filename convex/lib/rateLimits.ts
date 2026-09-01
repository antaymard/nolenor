import { ConvexError } from "convex/values";
import {
  RateLimiter,
  HOUR,
  MINUTE,
  type RateLimitConfig,
  type RunMutationCtx,
} from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/**
 * Limites d'usage, déclarées au même endroit que les messages d'erreur
 * (`config/errorsConfig.ts`) : une seule source à relire pour savoir ce que
 * l'app tolère.
 *
 * Ce qui est protégé ici, ce sont les surfaces qui coûtent de l'argent réel à
 * chaque appel (LLM, transcription Mistral, LinkPreview, stockage R2) ou qui
 * écrivent en base sans authentification (wishlist). Elles n'avaient aucune
 * borne : un script pouvait les boucler jusqu'à épuisement du budget.
 *
 * `token bucket` plutôt que `fixed window` sur les usages interactifs : un
 * utilisateur qui n'a rien fait depuis dix minutes doit pouvoir enchaîner
 * quelques actions d'affilée sans être bloqué, ce que `capacity` permet.
 */
const limits = {
  // Chaque message déclenche un run d'agent complet (le plus cher).
  noleMessage: {
    kind: "token bucket",
    rate: 30,
    period: MINUTE,
    capacity: 10,
  },
  // Génération d'images : facturée à l'image, et une requête peut en demander
  // plusieurs d'un coup. Plus serré que `noleMessage` pour cette raison.
  imageGeneration: {
    kind: "token bucket",
    rate: 15,
    period: MINUTE,
    capacity: 5,
  },
  // Transcription Mistral, facturée à la durée d'audio.
  speechTranscribe: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: 15,
  },
  // API LinkPreview, facturée à la requête.
  linkMetadata: {
    kind: "token bucket",
    rate: 120,
    period: MINUTE,
    capacity: 30,
  },
  // Frappe d'URLs présignées. Large : un collage multi-fichiers est légitime.
  uploadUrl: {
    kind: "token bucket",
    rate: 300,
    period: MINUTE,
    capacity: 60,
  },
  // Endpoint public non authentifié : la clé est l'IP, pas un userId.
  wishlistSubscribe: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
  // Envoi d'un code par email (vérification à l'inscription, réinitialisation
  // de mot de passe). Non authentifié, et ça envoie un vrai email : sans borne,
  // n'importe qui peut inonder la boîte d'un utilisateur en rejouant le flux
  // « mot de passe oublié » sur son adresse, et brûler le quota Resend au
  // passage.
  //
  // Le rate limiting intégré d'@convex-dev/auth ne couvre pas ce chemin : il
  // est indexé sur un compte existant (`retrieveAccountWithCredentials` sort
  // sur `InvalidAccountId` AVANT d'y toucher), et le flux `reset` n'envoie
  // aucun secret, donc il n'atteint jamais cette branche.
  //
  // La clé est l'adresse visée, pas l'appelant : c'est la boîte mail qu'on
  // protège. Capacité 3 pour laisser renvoyer un code deux fois d'affilée quand
  // le premier n'arrive pas, puis un toutes les dix minutes.
  // Chaque démarrage de consentement écrit une ligne `oauthAttempts`. Borné
  // pour qu'un client qui boucle sur le bouton ne remplisse pas la table entre
  // deux passages du cron de purge.
  connectionOAuthStart: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 5,
  },
  // Appels sortants sur une API tierce. La borne protège d'abord le QUOTA DU
  // COMPTE CONNECTÉ, qui n'est pas le nôtre : Gmail compte en unités par
  // utilisateur, GitHub en 5000 requêtes/heure, et c'est l'utilisateur qui se
  // retrouve bloqué chez lui si on le brûle.
  connectionApiCall: {
    kind: "token bucket",
    rate: 120,
    period: MINUTE,
    capacity: 30,
  },
  authEmailSend: {
    kind: "token bucket",
    rate: 6,
    period: HOUR,
    capacity: 3,
  },
} satisfies Record<string, RateLimitConfig>;

export const rateLimiter = new RateLimiter(components.rateLimiter, limits);

type RateLimitName = keyof typeof limits;

/**
 * Consomme un jeton et lève une `ConvexError` lisible si le quota est dépassé.
 *
 * On n'utilise pas l'option `throws` du composant : elle lève une
 * `RateLimitError` structurée que le front ne sait pas rendre. `toastError`
 * (côté client) affiche `ConvexError.data` quand c'est une chaîne, donc on lui
 * donne une phrase, avec le délai d'attente arrondi à la seconde supérieure.
 */
export async function enforceRateLimit(
  ctx: RunMutationCtx,
  name: RateLimitName,
  key: string,
): Promise<void> {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, name, { key });
  if (ok) return;

  const seconds = Math.max(1, Math.ceil((retryAfter ?? 0) / 1000));
  throw new ConvexError(
    `Too many requests. Try again in ${seconds} second${seconds > 1 ? "s" : ""}.`,
  );
}
