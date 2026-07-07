/**
 * Messages d'erreur user-friendly (FR) pour le speech-to-text.
 *
 * Centralise le mapping des erreurs navigateur (getUserMedia) et du protocole
 * voice-server (événements `error` + close codes WebSocket, cf. le README du
 * repo voice-server) vers du texte affichable, pour que les hooks STT ne
 * remontent jamais un message technique brut à l'utilisateur.
 */

/** Erreurs d'accès au micro / setup audio local (getUserMedia, AudioContext). */
export function describeMicrophoneError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "SecurityError":
        return "Accès au micro refusé. Autorisez le microphone dans les réglages du navigateur.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "Aucun microphone détecté.";
      case "NotReadableError":
      case "TrackStartError":
        return "Microphone indisponible (déjà utilisé par une autre application ?).";
      case "OverconstrainedError":
        return "Le microphone ne supporte pas les paramètres demandés.";
      default:
        break;
    }
  }
  return "Impossible d'accéder au microphone.";
}

/** Codes des événements `error` du voice-server (protocole /v1/realtime). */
const SERVER_ERROR_MESSAGES: Record<string, string> = {
  bad_message: "Erreur de communication avec le serveur vocal.",
  idle_timeout: "Session vocale fermée pour inactivité.",
  session_too_long: "Durée maximale de dictée atteinte.",
  upstream_error: "Le service de transcription est momentanément indisponible.",
  backpressure: "Connexion trop lente pour la dictée en direct.",
  server_shutdown: "Le serveur vocal redémarre, réessayez dans un instant.",
  server_error: "Erreur interne du serveur vocal.",
};

export function describeVoiceServerError(
  code: string | null,
  message: string | null,
): string {
  if (code && SERVER_ERROR_MESSAGES[code]) return SERVER_ERROR_MESSAGES[code];
  return message || "Erreur du serveur vocal.";
}

/**
 * Close codes WebSocket du voice-server. Les upgrades rejetés (token invalide,
 * origine non allowlistée, limite de sessions) apparaissent côté navigateur
 * comme une fermeture opaque (1006) : ils tombent dans le `fallback`.
 */
export function describeVoiceServerClose(
  code: number,
  reason: string | undefined,
  fallback: string,
): string {
  switch (code) {
    case 1001:
      return SERVER_ERROR_MESSAGES.server_shutdown;
    case 1011:
      return SERVER_ERROR_MESSAGES.server_error;
    case 4400:
      return SERVER_ERROR_MESSAGES.bad_message;
    case 4408:
      return SERVER_ERROR_MESSAGES.idle_timeout;
    case 4413:
      return SERVER_ERROR_MESSAGES.session_too_long;
    case 4502:
      return SERVER_ERROR_MESSAGES.upstream_error;
    default:
      return reason || fallback;
  }
}
