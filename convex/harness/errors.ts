import { APICallError, RetryError } from "ai";

/**
 * Une erreur de génération vaut-elle d'être rejouée ?
 *
 * L'AI SDK rejoue déjà l'ouverture de la requête (`maxRetries`), mais pas une
 * erreur arrivée en plein stream, ni un provider resté indisponible après ses
 * propres tentatives : c'est ce que rattrape la harness, avec un backoff plus
 * long. Dans le doute on ne rejoue pas : une requête invalide (400, contexte
 * trop long, clé refusée) échouerait de la même façon.
 */
export function isRetryableGenerationError(error: unknown): boolean {
  if (RetryError.isInstance(error)) {
    return isRetryableGenerationError(error.lastError);
  }
  if (APICallError.isInstance(error)) return error.isRetryable;
  return TRANSIENT_PATTERN.test(describe(error));
}

/**
 * Les erreurs passagères qui n'arrivent pas en `APICallError` : coupures
 * réseau, et erreurs que le provider envoie DANS le stream (OpenRouter y met
 * le code HTTP de l'amont).
 */
const TRANSIENT_PATTERN =
  /\b(408|429|500|502|503|504|520|522|524|529)\b|rate.?limit|overloaded|timed? ?out|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|fetch failed|network|terminated|temporarily unavailable|internal server error|bad gateway|service unavailable/i;

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? "";
  } catch {
    return String(error);
  }
}
