/**
 * Transcription des nodes audio (OpenRouter `/api/v1/audio/transcriptions`).
 *
 * Changer de modèle : poser `TRANSCRIPTION_MODEL` dans les variables d'env du
 * déploiement Convex (`npx convex env set TRANSCRIPTION_MODEL <id>`), sans
 * redéployer. ⚠️ Les timestamps de segments (`verbose_json`) ne sont rendus
 * que par les providers compatibles OpenAI (OpenAI, Groq, Together) : un
 * modèle routé ailleurs répond 400 à `verbose_json`, et la transcription
 * échoue avec ce message plutôt que de produire un transcript sans repères.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = "openai/whisper-large-v3-turbo";

export function getTranscriptionModel(): string {
  const fromEnv = process.env.TRANSCRIPTION_MODEL?.trim();
  return fromEnv ? fromEnv : DEFAULT_TRANSCRIPTION_MODEL;
}

/**
 * Plafond d'OpenRouter par requête STT. Au-delà, il faudrait extraire et
 * recompresser la piste (ffmpeg) puis découper : hors V1, la mutation refuse.
 */
export const MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024;

/**
 * Au-delà, un statut `running` ne peut plus correspondre à une action vivante
 * (Convex borne une action à 10 minutes) : on autorise une relance plutôt que
 * de verrouiller le node pour toujours.
 */
export const STALE_TRANSCRIPTION_MS = 10 * 60 * 1000;
