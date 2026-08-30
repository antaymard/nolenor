/**
 * User-friendly (EN) error messages for speech-to-text.
 *
 * Centralizes the mapping of browser errors (getUserMedia) and the voice-server
 * protocol (`error` events + WebSocket close codes, cf. the voice-server repo
 * README) to displayable text, so STT hooks never surface a raw technical
 * message to the user.
 */

/** Microphone access / local audio setup errors (getUserMedia, AudioContext). */
export function describeMicrophoneError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "SecurityError":
        return "Microphone access denied. Allow the microphone in your browser settings.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone detected.";
      case "NotReadableError":
      case "TrackStartError":
        return "Microphone unavailable (already in use by another application?).";
      case "OverconstrainedError":
        return "The microphone does not support the requested settings.";
      default:
        break;
    }
  }
  return "Unable to access the microphone.";
}

/** `error` event codes from the voice-server (/v1/realtime protocol). */
const SERVER_ERROR_MESSAGES: Record<string, string> = {
  bad_message: "Communication error with the voice server.",
  idle_timeout: "Voice session closed due to inactivity.",
  session_too_long: "Maximum dictation duration reached.",
  upstream_error: "The transcription service is temporarily unavailable.",
  backpressure: "Connection too slow for live dictation.",
  server_shutdown: "The voice server is restarting, please try again in a moment.",
  server_error: "Internal voice server error.",
};

export function describeVoiceServerError(
  code: string | null,
  message: string | null,
): string {
  if (code && SERVER_ERROR_MESSAGES[code]) return SERVER_ERROR_MESSAGES[code];
  return message || "Voice server error.";
}

/**
 * Voice-server WebSocket close codes. Rejected upgrades (invalid token,
 * non-allowlisted origin, session limit) surface in the browser as an opaque
 * closure (1006): they fall through to the `fallback`.
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