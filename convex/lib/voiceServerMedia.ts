import type { VoiceServerMediaConfig } from "../config/transcriptionConfig";

// Client du module `audio-parts` du voice-server : découpe d'un long fichier
// en morceaux transcriptibles (mp3 mono 16 kHz, ~20 min, coupés dans les
// silences), aux bornes exactes. Traitement média seulement : le STT reste
// chez OpenRouter (cf. ia/transcriptionRun.ts).
//
//   POST   /v1/media/audio-parts                  -> 202 { job_id, status }
//   GET    /v1/media/audio-parts/:id              -> état + morceaux prêts
//   GET    /v1/media/audio-parts/:id/parts/:index -> binaire d'un morceau
//   DELETE /v1/media/audio-parts/:id              -> 204

export type AudioPartsJobStatus =
  | "queued"
  | "downloading"
  | "probing"
  | "analyzing"
  | "splitting"
  | "done"
  | "error";

export type AudioPart = {
  index: number;
  startSec: number;
  endSec: number;
  bytes: number;
};

export type AudioPartsJob = {
  status: AudioPartsJobStatus;
  durationSec: number | null;
  /** Connu à partir de `splitting`. */
  totalParts: number | null;
  /** Seulement les morceaux prêts, triés par index. */
  parts: AudioPart[];
  error: { code: string; message: string } | null;
};

/** Erreur du voice-server, avec son code d'enveloppe (`busy`, `media_disabled`…). */
export class VoiceServerMediaError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "VoiceServerMediaError";
    this.code = code;
    this.status = status;
  }
}

const JOB_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "downloading",
  "probing",
  "analyzing",
  "splitting",
  "done",
  "error",
]);

// Lecture défensive d'un JSON externe, comme ia/agents.ts : sa forme est
// documentée mais pas garantie, et un cast menteur planterait loin de la cause.
function readKey(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function errorFromResponse(
  response: Response,
): Promise<VoiceServerMediaError> {
  const body: unknown = await response.json().catch(() => null);
  const error = readKey(body, "error");
  const code = readString(readKey(error, "code")) ?? `http_${response.status}`;
  const message =
    readString(readKey(error, "message")) ??
    `Voice server request failed (${response.status}).`;
  return new VoiceServerMediaError(code, message, response.status);
}

function endpoint(config: VoiceServerMediaConfig, path: string): string {
  return `${config.baseUrl}/v1/media/audio-parts${path}`;
}

function authHeaders(config: VoiceServerMediaConfig): Record<string, string> {
  return { Authorization: `Bearer ${config.token}` };
}

/** Crée le job de découpe. `busy` (429) est une erreur à part : on réessaie. */
export async function createAudioPartsJob(
  config: VoiceServerMediaConfig,
  input: { sourceUrl: string; partSeconds: number; format: "mp3" | "ogg" },
): Promise<{ jobId: string }> {
  const response = await fetch(endpoint(config, ""), {
    method: "POST",
    headers: { ...authHeaders(config), "Content-Type": "application/json" },
    body: JSON.stringify({
      source_url: input.sourceUrl,
      part_seconds: input.partSeconds,
      format: input.format,
    }),
  });
  if (!response.ok) throw await errorFromResponse(response);
  const body: unknown = await response.json();
  const jobId = readString(readKey(body, "job_id"));
  if (!jobId) {
    throw new VoiceServerMediaError(
      "invalid_response",
      "The voice server returned no job id.",
    );
  }
  return { jobId };
}

/** État du job, morceaux prêts inclus. */
export async function getAudioPartsJob(
  config: VoiceServerMediaConfig,
  jobId: string,
): Promise<AudioPartsJob> {
  const response = await fetch(
    endpoint(config, `/${encodeURIComponent(jobId)}`),
    {
      headers: authHeaders(config),
    },
  );
  if (!response.ok) throw await errorFromResponse(response);
  const body: unknown = await response.json();

  const rawStatus = readString(readKey(body, "status"));
  if (!rawStatus || !JOB_STATUSES.has(rawStatus)) {
    throw new VoiceServerMediaError(
      "invalid_response",
      `The voice server returned an unknown job status (${String(rawStatus)}).`,
    );
  }

  const rawParts = readKey(body, "parts");
  const parts = (Array.isArray(rawParts) ? rawParts : [])
    .flatMap((part): AudioPart[] => {
      const index = readNumber(readKey(part, "index"));
      const startSec = readNumber(readKey(part, "start_sec"));
      const endSec = readNumber(readKey(part, "end_sec"));
      const bytes = readNumber(readKey(part, "bytes")) ?? 0;
      if (index === null || startSec === null || endSec === null) return [];
      return [{ index, startSec, endSec, bytes }];
    })
    .sort((a, b) => a.index - b.index);

  const error = readKey(body, "error");
  return {
    status: rawStatus as AudioPartsJobStatus,
    durationSec: readNumber(readKey(body, "duration_sec")),
    totalParts: readNumber(readKey(body, "total_parts")),
    parts,
    error:
      error && typeof error === "object"
        ? {
            code: readString(readKey(error, "code")) ?? "unknown",
            message:
              readString(readKey(error, "message")) ??
              "The voice server could not prepare this file.",
          }
        : null,
  };
}

/** Télécharge un morceau prêt. */
export async function downloadAudioPart(
  config: VoiceServerMediaConfig,
  jobId: string,
  index: number,
): Promise<Blob> {
  const response = await fetch(
    endpoint(config, `/${encodeURIComponent(jobId)}/parts/${index}`),
    { headers: authHeaders(config) },
  );
  if (!response.ok) throw await errorFromResponse(response);
  return await response.blob();
}

/** Libère le job. Jamais bloquant : le TTL du voice-server rattrape un échec. */
export async function deleteAudioPartsJob(
  config: VoiceServerMediaConfig,
  jobId: string,
): Promise<void> {
  try {
    await fetch(endpoint(config, `/${encodeURIComponent(jobId)}`), {
      method: "DELETE",
      headers: authHeaders(config),
    });
  } catch (error) {
    console.warn("[voiceServerMedia] delete failed", {
      jobId,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
