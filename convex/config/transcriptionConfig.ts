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

/**
 * Résumés des transcripts (titre + résumé par passage, vue d'ensemble), en un
 * appel LLM après la transcription. Surchargeable par `TRANSCRIPT_SUMMARY_MODEL`
 * dans l'env du déploiement. Le même modèle rapide que le captioning d'images.
 */
export const DEFAULT_TRANSCRIPT_SUMMARY_MODEL = "deepseek/deepseek-v4.1-flash";

export function getTranscriptSummaryModel(): string {
  const fromEnv = process.env.TRANSCRIPT_SUMMARY_MODEL?.trim();
  return fromEnv ? fromEnv : DEFAULT_TRANSCRIPT_SUMMARY_MODEL;
}

/**
 * Au-delà de ce nombre de passages (~2 min chacun, donc ≈ 80 min), le résumé
 * part par lots de `TRANSCRIPT_SUMMARY_BATCH_SIZE`, chacun avec le résumé du
 * lot précédent en contexte. Inatteignable tant que la transcription est
 * plafonnée à 25 Mo (≈ 1 h), mais le code est prêt pour la vidéo / l'audio long.
 */
export const TRANSCRIPT_SUMMARY_SINGLE_CALL_MAX_PASSAGES = 40;
export const TRANSCRIPT_SUMMARY_BATCH_SIZE = 20;
