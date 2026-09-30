/**
 * Transcription des nodes audio et vidéo (OpenRouter `/api/v1/audio/transcriptions`).
 *
 * Changer de modèle : poser `TRANSCRIPTION_MODEL` dans les variables d'env du
 * déploiement Convex (`npx convex env set TRANSCRIPTION_MODEL <id>`), sans
 * redéployer. ⚠️ Les timestamps de segments (`verbose_json`) ne sont rendus
 * que par les providers compatibles OpenAI (OpenAI, Groq, Together) : un
 * modèle routé ailleurs répond 400 à `verbose_json`, et la transcription
 * échoue avec ce message plutôt que de produire un transcript sans repères.
 */
export const DEFAULT_TRANSCRIPTION_MODEL = "mistralai/voxtral-mini-transcribe";
export const DEFAULT_TRANSCRIPTION_MODEL_PROVIDERS = ['mistral/eu'];

export function getTranscriptionModel(): string {
  const fromEnv = process.env.TRANSCRIPTION_MODEL?.trim();
  return fromEnv ? fromEnv : DEFAULT_TRANSCRIPTION_MODEL;
}
export function getTranscriptionModelProviders(): string[] {
  return DEFAULT_TRANSCRIPTION_MODEL_PROVIDERS;
}

/**
 * Plafond d'OpenRouter par requête STT. En dessous, le fichier part tel quel
 * (chemin direct) ; au-delà, il passe par le module `audio-parts` du
 * voice-server, qui le découpe en morceaux transcriptibles.
 */
export const MAX_TRANSCRIPTION_DIRECT_BYTES = 25 * 1024 * 1024;

/**
 * Plafond avec le voice-server : la limite d'upload audio
 * (cf. `config/uploadsConfig.ts`). Le voice-server borne de son côté la
 * durée (8 h) et la taille (600 Mo).
 */
export const MAX_TRANSCRIPTION_LONG_BYTES = 200 * 1024 * 1024;

/**
 * Plafond des vidéos : leur limite d'upload. Une vidéo passe toujours par le
 * voice-server, qui n'en garde que la piste audio : Convex ne télécharge
 * jamais la vidéo elle-même.
 */
export const MAX_VIDEO_TRANSCRIPTION_BYTES = 500 * 1024 * 1024;

/** Découpe demandée au voice-server : des morceaux d'environ 20 min. */
export const TRANSCRIPTION_PART_SECONDS = 1200;
/** Morceaux transcrits en même temps, au plus. */
export const TRANSCRIPTION_PARALLELISM = 4;
/** Cadence de lecture de l'état du job de découpe. */
export const TRANSCRIPTION_POLL_MS = 2_500;
/**
 * Temps de travail d'une transcription longue. Convex tue une action à
 * 10 min : on s'arrête avant, pour avoir encore le temps d'écrire le statut
 * `error` et de libérer le job sur le voice-server.
 */
export const TRANSCRIPTION_TIME_BUDGET_MS = 510_000;

export type VoiceServerMediaConfig = { baseUrl: string; token: string };

/**
 * Accès au voice-server pour la découpe des longs fichiers : les mêmes
 * `VOICE_SERVER_URL` / `VOICE_SERVER_TOKEN` que le STT live (cf. voice.ts).
 * L'URL peut y être en `wss://` ou sans schéma : ramenée en `https://`.
 * `null` si l'une manque, et le mode long est alors désactivé.
 */
export function getVoiceServerMediaConfig(): VoiceServerMediaConfig | null {
  const rawUrl = process.env.VOICE_SERVER_URL?.trim();
  const token = process.env.VOICE_SERVER_TOKEN?.trim();
  if (!rawUrl || !token) return null;
  let baseUrl = rawUrl.replace(/\/+$/, "");
  baseUrl = baseUrl.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
  if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `https://${baseUrl}`;
  return { baseUrl, token };
}

/**
 * Plus gros fichier transcriptible pour ce type de node, selon que le
 * voice-server est disponible. `null` : pas de transcription possible (une
 * vidéo sans voice-server, faute d'extraction de l'audio).
 */
export function getMaxTranscriptionBytes(
  nodeType: "audio" | "video",
): number | null {
  const hasVoiceServer = getVoiceServerMediaConfig() !== null;
  if (nodeType === "video") {
    return hasVoiceServer ? MAX_VIDEO_TRANSCRIPTION_BYTES : null;
  }
  return hasVoiceServer
    ? MAX_TRANSCRIPTION_LONG_BYTES
    : MAX_TRANSCRIPTION_DIRECT_BYTES;
}

/**
 * Au-delà, un statut `running` ne peut plus correspondre à une action vivante
 * (Convex borne une action à 10 minutes) : on autorise une relance plutôt que
 * de verrouiller le node pour toujours.
 */
export const STALE_TRANSCRIPTION_MS = 10 * 60 * 1000;

/**
 * Chapitres des transcripts (titre + résumé par chapitre, vue d'ensemble), en
 * un appel LLM après la transcription. Surchargeable par `TRANSCRIPT_SUMMARY_MODEL`
 * dans l'env du déploiement. Le même modèle rapide que le captioning d'images.
 */
export const DEFAULT_TRANSCRIPT_SUMMARY_MODEL = "deepseek/deepseek-v4.1-flash";

export function getTranscriptSummaryModel(): string {
  const fromEnv = process.env.TRANSCRIPT_SUMMARY_MODEL?.trim();
  return fromEnv ? fromEnv : DEFAULT_TRANSCRIPT_SUMMARY_MODEL;
}

/**
 * Au-delà de cette taille de transcript (en caractères de prompt, ≈ 2 h de
 * parole, ≈ 30k tokens), le chapitrage part par lots d'au plus
 * `TRANSCRIPT_CHAPTERS_BATCH_CHARS`, chacun avec les chapitres précédents en
 * contexte, puis la vue d'ensemble se fait à partir des chapitres.
 */
export const TRANSCRIPT_CHAPTERS_SINGLE_CALL_MAX_CHARS = 120_000;
export const TRANSCRIPT_CHAPTERS_BATCH_CHARS = 90_000;
