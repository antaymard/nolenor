import type { VoiceServerMediaConfig } from "../../config/transcriptionConfig";
import {
  VoiceServerMediaError,
  createAudioPartsJob,
  deleteAudioPartsJob,
  downloadAudioPart,
  getAudioPartsJob,
  type AudioPart,
} from "../../lib/voiceServerMedia";
import {
  mergeTranscriptParts,
  type RawTranscriptSegment,
} from "../../lib/transcriptChunks";

// Transcription d'un fichier trop gros pour une seule requête STT : le
// voice-server le découpe (morceaux progressifs, bornes exactes), chaque
// morceau est transcrit dès qu'il est prêt, puis tout est recollé en un seul
// flux horodaté. Sans `ctx` et à dépendances injectées (STT, horloge,
// progression) : testable contre un faux voice-server.

/**
 * Ce qu'un appel STT rend, pour un morceau. Le coût n'en fait pas partie :
 * l'appelant le cumule dans son `transcribePart`, pour compter aussi les
 * morceaux déjà payés quand un autre fait échouer l'ensemble.
 */
export type PartTranscription = {
  segments: RawTranscriptSegment[];
  language: string | undefined;
};

export type LongTranscriptionResult = {
  segments: RawTranscriptSegment[];
  language: string | undefined;
  durationSec: number | undefined;
  partCount: number;
};

export type LongTranscriptionOptions = {
  voiceServer: VoiceServerMediaConfig;
  sourceUrl: string;
  partSeconds: number;
  parallelism: number;
  pollMs: number;
  /** Instant (ms epoch) au-delà duquel on abandonne. */
  deadline: number;
  transcribePart: (audio: Blob, part: AudioPart) => Promise<PartTranscription>;
  /** Appelé quand le nombre de morceaux transcrits (ou le total) change. */
  onProgress?: (done: number, total: number) => Promise<void> | void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** `busy` (429) : le voice-server traite déjà son maximum de jobs. */
const BUSY_RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

export const LONG_TRANSCRIPTION_ERRORS = {
  tooLong: "This recording took too long to transcribe. Try again later.",
  busy: "The transcription service is busy. Try again in a moment.",
  disabled:
    "Long recordings cannot be transcribed right now (the media service is unavailable).",
} as const;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createJobWithRetry(
  options: LongTranscriptionOptions,
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { jobId } = await createAudioPartsJob(options.voiceServer, {
        sourceUrl: options.sourceUrl,
        partSeconds: options.partSeconds,
        format: "mp3",
      });
      return jobId;
    } catch (error) {
      if (error instanceof VoiceServerMediaError) {
        if (error.code === "media_disabled") {
          throw new Error(LONG_TRANSCRIPTION_ERRORS.disabled);
        }
        if (error.code === "busy") {
          const delay = BUSY_RETRY_DELAYS_MS[attempt];
          if (delay === undefined) {
            throw new Error(LONG_TRANSCRIPTION_ERRORS.busy);
          }
          await sleep(delay);
          continue;
        }
      }
      throw error;
    }
  }
}

/**
 * Découpe via le voice-server puis transcrit chaque morceau, au plus
 * `parallelism` à la fois, en commençant dès que le premier est prêt.
 *
 * Tout ou rien : un morceau qui échoue deux fois fait échouer l'ensemble,
 * plutôt que de produire un transcript à trous. Le job est toujours libéré
 * côté voice-server, succès ou échec.
 */
export async function transcribeLongAudio(
  options: LongTranscriptionOptions,
): Promise<LongTranscriptionResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const jobId = await createJobWithRetry(options, sleep);

  const results = new Map<
    number,
    { part: AudioPart; transcription: PartTranscription }
  >();
  const started = new Set<number>();
  const queue: AudioPart[] = [];
  const inFlight = new Set<Promise<void>>();
  let failure: Error | undefined;
  let reportedDone = -1;
  let reportedTotal = -1;

  async function report(total: number | null) {
    if (total === null || !options.onProgress) return;
    if (results.size === reportedDone && total === reportedTotal) return;
    reportedDone = results.size;
    reportedTotal = total;
    await options.onProgress(results.size, total);
  }

  async function runPart(part: AudioPart): Promise<void> {
    let lastError: unknown;
    // Un seul nouvel essai : un morceau qui échoue deux fois est un vrai échec.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const audio = await downloadAudioPart(
          options.voiceServer,
          jobId,
          part.index,
        );
        const transcription = await options.transcribePart(audio, part);
        results.set(part.index, { part, transcription });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    failure ??=
      lastError instanceof Error
        ? lastError
        : new Error(`Part ${part.index + 1} could not be transcribed.`);
  }

  function launch() {
    while (
      !failure &&
      inFlight.size < options.parallelism &&
      queue.length > 0
    ) {
      const part = queue.shift()!;
      const task: Promise<void> = runPart(part).finally(() => {
        inFlight.delete(task);
      });
      inFlight.add(task);
    }
  }

  try {
    let durationSec: number | undefined;
    let totalParts: number | null = null;

    for (;;) {
      if (failure) throw failure;
      if (now() > options.deadline) {
        throw new Error(LONG_TRANSCRIPTION_ERRORS.tooLong);
      }

      const job = await getAudioPartsJob(options.voiceServer, jobId);
      if (job.status === "error") {
        throw new Error(
          job.error?.message ?? "The recording could not be prepared.",
        );
      }
      durationSec = job.durationSec ?? durationSec;
      totalParts = job.totalParts ?? totalParts;

      for (const part of job.parts) {
        if (started.has(part.index)) continue;
        started.add(part.index);
        queue.push(part);
      }
      launch();
      await report(totalParts);

      const allTranscribed =
        job.status === "done" &&
        queue.length === 0 &&
        inFlight.size === 0 &&
        results.size === job.parts.length;
      if (allTranscribed) break;

      // Réveil dès qu'un morceau finit (pour relancer le pool et la
      // progression), sinon à la prochaine lecture de l'état du job.
      await Promise.race([sleep(options.pollMs), ...inFlight]);
    }

    if (failure) throw failure;
    if (results.size === 0) {
      throw new Error("The recording could not be split into parts.");
    }

    const ordered = [...results.values()].sort(
      (a, b) => a.part.index - b.part.index,
    );
    // Des index consécutifs à partir de 0 : sinon un morceau manque.
    ordered.forEach((entry, position) => {
      if (entry.part.index !== position) {
        throw new Error("A part of the recording is missing.");
      }
    });
    await report(ordered.length);

    return {
      segments: mergeTranscriptParts(
        ordered.map((entry) => ({
          startSec: entry.part.startSec,
          segments: entry.transcription.segments,
        })),
      ),
      language: ordered.find((entry) => entry.transcription.language)
        ?.transcription.language,
      durationSec,
      partCount: ordered.length,
    };
  } finally {
    // Les morceaux encore en vol finissent (ou échouent) avant qu'on rende la
    // main : pas de promesse orpheline dans l'action.
    await Promise.allSettled([...inFlight]);
    await deleteAudioPartsJob(options.voiceServer, jobId);
  }
}
