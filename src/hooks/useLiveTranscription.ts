import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeMicrophoneError,
  describeVoiceServerClose,
  describeVoiceServerError,
} from "@/lib/speechErrors";

/**
 * Hook de transcription LIVE (streaming) via le voice-server.
 *
 * Le navigateur capte le micro, le ré-encode en PCM s16le mono et l'envoie au
 * fil de l'eau sur un WebSocket vers le voice-server, qui relaie vers le moteur
 * de transcription et renvoie des événements JSON.
 *
 * Deux moteurs (`provider`), avec des protocoles DIFFÉRENTS côté serveur — la
 * capture audio, elle, est strictement identique :
 *
 * - `mistral` (`/v1/realtime`) : flux de `delta` cumulatifs (texte interim qui
 *   s'ajoute), `segment` finalisés, event `language` séparé, `done` avec la
 *   langue. Réglable via `targetDelayMs` (latence vs précision).
 * - `gladia` (`/v1/gladia/realtime`) : découpage par utterance avec détection
 *   de fin de parole. Les `partial` REMPLACENT l'hypothèse courante (ils ne
 *   s'ajoutent pas), les `utterance` sont les segments définitifs, la langue
 *   voyage sur ces événements et `done` ne la porte pas. En échange : hint de
 *   langues et vocabulaire métier applicables en direct.
 *
 * Ces différences sont absorbées ici : le hook expose la même surface
 * (`transcript` / `partial` / `segments` / `language`) quel que soit le moteur.
 *
 * Ce hook est "transport-only" : il reçoit `serverUrl` + `token` en paramètres.
 * Pour l'usage dans l'app, préférer `useNoleLiveTranscription` qui récupère la
 * config depuis Convex (token hors bundle) et fixe le moteur.
 */

/** Moteur de transcription servi par le voice-server. */
export type LiveTranscriptionProvider = "mistral" | "gladia";

/**
 * Terme de vocabulaire métier (Gladia uniquement) : biaise phonétiquement la
 * transcription vers les mots du domaine. La forme objet permet d'affiner —
 * `pronunciations` = comment le terme sonne à l'oral, `intensity` (0..1) =
 * agressivité du remplacement des quasi-correspondances, `language` = langue du
 * terme lui-même (un nom anglais dans un transcript français, par exemple).
 */
export type LiveVocabularyEntry =
  | string
  | {
      value: string;
      pronunciations?: string[];
      intensity?: number;
      language?: string;
    };

export type LiveTranscriptionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "stopping"
  | "error";

/**
 * Catégorie d'erreur, pour que le caller puisse adapter sa réaction (ex. :
 * basculer sur le STT batch après un `connect_failed`, mais pas après un
 * `mic_error` — le batch a besoin du micro aussi).
 */
export type LiveTranscriptionErrorCode =
  /** URL ou token du voice-server manquant. */
  | "config_missing"
  /** Micro refusé/absent, ou échec du setup audio local. */
  | "mic_error"
  /**
   * La session live n'a pas pu s'établir : serveur injoignable, jamais de
   * `ready`, ou capture locale incompatible avec le moteur. Dans tous les cas
   * le STT batch reste une alternative viable.
   */
  | "connect_failed"
  /** Erreur renvoyée par le serveur ou coupure en cours de session. */
  | "server_error";

export interface LiveTranscriptionError {
  code: LiveTranscriptionErrorCode;
  /** Message affichable tel quel à l'utilisateur (FR). */
  message: string;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export interface UseLiveTranscriptionOptions {
  /** Base URL du voice-server (https://… ou wss://…). */
  serverUrl?: string | null;
  /** Token Bearer du voice-server. */
  token?: string | null;
  /** Moteur de transcription. Défaut `mistral`. */
  provider?: LiveTranscriptionProvider;
  /** Sample rate de capture souhaité (Hz). Défaut 16000. */
  sampleRate?: number;
  /**
   * Latence cible (ms) envoyée au serveur, clampée 240–2400. Défaut 480.
   * `mistral` uniquement — Gladia découpe par détection de fin de parole
   * (cf. `endpointing`) et n'a pas d'équivalent.
   */
  targetDelayMs?: number;
  /**
   * `gladia` : langues candidates (ISO 639-1). Vide/absent = auto-détection,
   * une seule = langue forcée, plusieurs = détection restreinte à la liste.
   */
  languages?: string[];
  /** `gladia` : autorise le changement de langue en cours de session. */
  codeSwitching?: boolean;
  /** `gladia` : vocabulaire métier appliqué en direct. */
  vocabulary?: LiveVocabularyEntry[];
  /** `gladia` : intensité de remplacement par défaut (0..1). */
  vocabularyIntensity?: number;
  /**
   * `gladia` : secondes de silence qui finalisent une utterance. Le défaut
   * Gladia (0.05 s) découpe très fin ; ~0.3 s donne des segments plus longs,
   * donc une meilleure ponctuation.
   */
  endpointing?: number;
  /** Appelé à chaque segment finalisé. */
  onSegment?: (segment: TranscriptSegment) => void;
  /** Appelé quand le flux est finalisé (transcript complet). */
  onDone?: (result: { text: string; language: string | null }) => void;
  /** Appelé en cas d'erreur, avec un message affichable et un code. */
  onError?: (error: LiveTranscriptionError) => void;
}

export interface UseLiveTranscription {
  status: LiveTranscriptionStatus;
  /** Texte finalisé (segments concaténés). */
  transcript: string;
  /** Texte interim en cours (deltas non encore finalisés). */
  partial: string;
  /** transcript + partial — pratique pour l'affichage live. */
  liveText: string;
  /** Segments finalisés avec timestamps. */
  segments: TranscriptSegment[];
  /** Langue détectée (code ISO 639-1) ou null. */
  language: string | null;
  /** Niveau micro 0..1 (pour une petite animation), 0 quand inactif. */
  level: number;
  error: string | null;
  isListening: boolean;
  /** Démarre la capture + la session de transcription. */
  start: () => Promise<void>;
  /** Stoppe proprement et récupère le transcript final. */
  stop: () => void;
  /** Réinitialise transcript/partial/erreur (seulement quand inactif). */
  reset: () => void;
  /** Réveille le serveur (cold start) sans ouvrir de session. Throttlé. */
  prewarm: () => void;
}

const PCM_WORKLET_NAME = "nole-pcm-encoder";

// Plafond de trames bufferisées avant le `ready` serveur (~20 s à 100 ms/trame).
// Filet de sécurité contre une montée mémoire si `ready` n'arrive jamais.
const MAX_PENDING_FRAMES = 200;

// Sample rates acceptés par chaque moteur. Les listes diffèrent (Mistral prend
// 22050 mais pas 32000, Gladia l'inverse) : envoyer une valeur hors liste fait
// répondre `bad_message` et fermer en 4400, donc on snappe sur la plus proche.
const SUPPORTED_SAMPLE_RATES: Record<
  LiveTranscriptionProvider,
  readonly number[]
> = {
  mistral: [8000, 16000, 22050, 44100, 48000],
  gladia: [8000, 16000, 32000, 44100, 48000],
};

// Délai d'attente du `done` après un `stop`, par moteur. Le serveur laisse
// respectivement 10 s et 15 s au moteur amont pour livrer son transcript
// post-traité ; on n'attend pas autant côté composer (le texte déjà reçu est
// livré à l'expiration), mais Gladia a besoin d'un peu plus d'air que Mistral.
const DONE_TIMEOUT_MS: Record<LiveTranscriptionProvider, number> = {
  mistral: 5000,
  gladia: 8000,
};

// Si le serveur n'a pas envoyé `ready` dans ce délai, on abandonne avec une
// erreur explicite plutôt que de rester en "connecting" indéfiniment (couvre
// le cold start qui échoue, un proxy qui accepte le WS sans backend, etc.).
const READY_TIMEOUT_MS = 20_000;

// Worklet inline, chargé via Blob URL : reste self-contained (aucun asset public,
// aucune config Vite). Capte le Float32 micro, le convertit en PCM s16le et
// pousse des trames (~100 ms) vers le thread principal.
const PCM_WORKLET_SOURCE = `
class PCMEncoder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.frameSamples = o.frameSamples || 1600;
    this.buf = new Int16Array(this.frameSamples);
    this.pos = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        let s = channel[i];
        if (s > 1) s = 1; else if (s < -1) s = -1;
        this.buf[this.pos++] = s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0;
        if (this.pos === this.frameSamples) {
          const out = new ArrayBuffer(this.frameSamples * 2);
          const view = new DataView(out);
          for (let j = 0; j < this.frameSamples; j++) {
            view.setInt16(j * 2, this.buf[j], true); // little-endian (s16le)
          }
          this.port.postMessage(out, [out]);
          this.pos = 0;
        }
      }
    }
    // Sortie laissée à zéro : connectée à destination => pas d'écho, mais le
    // graphe reste "actif" donc process() est garanti d'être appelé.
    return true;
  }
}
registerProcessor(${JSON.stringify(PCM_WORKLET_NAME)}, PCMEncoder);
`;

function buildRealtimeUrl(
  base: string,
  token: string,
  provider: LiveTranscriptionProvider,
): string {
  let u = base.trim().replace(/\/+$/, "");
  u = u.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  if (!/^wss?:/i.test(u)) u = "wss://" + u;
  const path = provider === "gladia" ? "/v1/gladia/realtime" : "/v1/realtime";
  return `${u}${path}?token=${encodeURIComponent(token)}`;
}

function clampDelay(d: number | undefined): number {
  const n = d ?? 480;
  return Math.min(2400, Math.max(240, Math.round(n)));
}

/**
 * Le taux déclaré dans la frame `start` doit être EXACTEMENT celui des trames
 * PCM envoyées : le rabattre sur la valeur acceptée la plus proche ferait
 * relire l'audio à la mauvaise vitesse (transcript pitché, donc inexploitable)
 * au lieu de lever une erreur. On valide, on ne corrige pas.
 *
 * En pratique quasi inatteignable : l'AudioContext est demandé à 16 kHz, et le
 * fallback `new Ctor()` sans argument donne le taux du device (44,1 ou 48 kHz),
 * tous acceptés par les deux moteurs.
 */
function isSupportedRate(
  rate: number,
  provider: LiveTranscriptionProvider,
): boolean {
  return SUPPORTED_SAMPLE_RATES[provider].includes(rate);
}

/** Frame `start` du moteur visé (protocoles non interchangeables). */
function buildStartMessage(
  provider: LiveTranscriptionProvider,
  sampleRate: number,
  options: UseLiveTranscriptionOptions,
): Record<string, unknown> {
  if (provider === "gladia") {
    const msg: Record<string, unknown> = { type: "start", sampleRate };
    if (options.languages?.length) msg.languages = options.languages;
    if (options.codeSwitching) msg.codeSwitching = true;
    if (options.vocabulary?.length) msg.vocabulary = options.vocabulary;
    if (options.vocabularyIntensity !== undefined) {
      msg.vocabularyIntensity = options.vocabularyIntensity;
    }
    if (options.endpointing !== undefined) msg.endpointing = options.endpointing;
    return msg;
  }
  return {
    type: "start",
    sampleRate,
    targetDelayMs: clampDelay(options.targetDelayMs),
  };
}

function joinText(a: string, b: string): string {
  const t = b.trim();
  if (!t) return a;
  if (!a) return t;
  return `${a} ${t}`.replace(/\s+/g, " ");
}

export function useLiveTranscription(
  options: UseLiveTranscriptionOptions = {},
): UseLiveTranscription {
  const { serverUrl, token, sampleRate } = options;
  const provider: LiveTranscriptionProvider = options.provider ?? "mistral";

  const [status, setStatus] = useState<LiveTranscriptionStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [partial, setPartial] = useState("");
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [language, setLanguage] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Tout ce qui ne doit pas déclencher de re-render vit dans des refs.
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const workletUrlRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const stoppingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const genRef = useRef(0);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLevelRef = useRef(0);
  // Miroirs des états transcript/partial/language, pour livrer un best-effort
  // depuis les timers de secours sans dépendre d'une closure périmée.
  const transcriptRef = useRef("");
  const partialRef = useRef("");
  const languageRef = useRef<string | null>(null);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    partialRef.current = partial;
  }, [partial]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  // Trames PCM captées avant le `ready` serveur : bufferisées puis flushées,
  // pour ne pas perdre la 1re phrase pendant le warm-up.
  const pendingFramesRef = useRef<ArrayBuffer[]>([]);
  // Dernier prewarm (ms) — pour throttler les pings /healthz.
  const lastPrewarmRef = useRef(0);

  // Options de session (frame `start`) tenues à jour sans re-créer `start` :
  // un tableau `vocabulary` recréé à chaque render ne doit pas re-binder le
  // push-to-talk. Lues seulement à l'ouverture de la session.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Callbacks tenus à jour sans re-créer start/stop.
  const onSegmentRef = useRef(options.onSegment);
  const onDoneRef = useRef(options.onDone);
  const onErrorRef = useRef(options.onError);
  useEffect(() => {
    onSegmentRef.current = options.onSegment;
    onDoneRef.current = options.onDone;
    onErrorRef.current = options.onError;
  });

  const updateLevel = useCallback((rms: number) => {
    const v = Math.min(1, rms * 1.6); // léger gain pour l'UI
    const rounded = Math.round(v * 100) / 100;
    if (rounded !== lastLevelRef.current) {
      lastLevelRef.current = rounded;
      setLevel(rounded);
    }
  }, []);

  const teardownAll = useCallback(() => {
    // Invalide toute callback async en vol (générations périmées sont ignorées).
    genRef.current++;
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
    if (readyTimerRef.current) {
      clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    if (workletRef.current) {
      workletRef.current.port.onmessage = null;
      try {
        workletRef.current.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    sourceRef.current = null;
    workletRef.current = null;
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close().catch(() => {});
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }
    readyRef.current = false;
    stopRequestedRef.current = false;
    lastLevelRef.current = 0;
    pendingFramesRef.current = [];
  }, []);

  const finalizeStop = useCallback(() => {
    teardownAll();
    setStatus("idle");
    setLevel(0);
  }, [teardownAll]);

  const failWith = useCallback(
    (code: LiveTranscriptionErrorCode, message: string) => {
      teardownAll();
      setStatus("error");
      setLevel(0);
      setError(message);
      onErrorRef.current?.({ code, message });
    },
    [teardownAll],
  );

  // Envoie le `stop` au serveur et arme le filet de sécurité `done`.
  const requestServerStop = useCallback(() => {
    setStatus("stopping");
    setLevel(0);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "stop" }));
      } catch {
        /* noop */
      }
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      // `done` jamais reçu : on livre le texte déjà transcrit plutôt que de
      // jeter la dictée, et on signale l'échec si on n'a rien du tout.
      doneTimerRef.current = setTimeout(() => {
        const text = joinText(transcriptRef.current, partialRef.current).trim();
        if (text) {
          onDoneRef.current?.({ text, language: languageRef.current });
          finalizeStop();
        } else {
          failWith(
            "server_error",
            "Le serveur vocal n'a pas renvoyé de transcription. Réessayez.",
          );
        }
      }, DONE_TIMEOUT_MS[provider]);
    } else {
      finalizeStop();
    }
  }, [finalizeStop, failWith, provider]);

  const handleServerMessage = useCallback(
    (ev: MessageEvent) => {
      if (typeof ev.data !== "string") return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      const type = typeof msg.type === "string" ? msg.type : null;
      if (!type) return;

      switch (type) {
        case "ready": {
          readyRef.current = true;
          if (readyTimerRef.current) {
            clearTimeout(readyTimerRef.current);
            readyTimerRef.current = null;
          }
          // Flush des trames captées pendant le warm-up (sinon 1re phrase perdue).
          const ws = wsRef.current;
          const pending = pendingFramesRef.current;
          pendingFramesRef.current = [];
          if (ws && ws.readyState === WebSocket.OPEN) {
            for (const frame of pending) ws.send(frame);
          }
          if (stopRequestedRef.current) {
            // Stop demandé pendant le warm-up : audio flushé, on finalise.
            stopRequestedRef.current = false;
            requestServerStop();
          } else {
            setStatus("listening");
          }
          break;
        }
        // --- Mistral : texte interim cumulatif ---------------------------
        case "delta":
          if (typeof msg.text === "string") {
            const chunk = msg.text;
            setPartial((p) => p + chunk);
          }
          break;
        // --- Gladia : hypothèse de l'utterance courante -------------------
        // Contrairement à `delta`, chaque `partial` REMPLACE le précédent :
        // l'accumuler dupliquerait le texte à chaque frame.
        case "partial":
          if (typeof msg.text === "string") setPartial(msg.text);
          if (typeof msg.language === "string") setLanguage(msg.language);
          break;
        // `segment` (Mistral) et `utterance` (Gladia) portent la même
        // sémantique — texte définitif horodaté — et le même payload.
        case "segment":
        case "utterance": {
          const seg: TranscriptSegment = {
            text: typeof msg.text === "string" ? msg.text : "",
            start: typeof msg.start === "number" ? msg.start : 0,
            end: typeof msg.end === "number" ? msg.end : 0,
          };
          setSegments((s) => [...s, seg]);
          setTranscript((t) => joinText(t, seg.text));
          setPartial("");
          // Gladia n'a pas d'événement `language` dédié : la langue voyage sur
          // les utterances (et sur les `partial`).
          if (typeof msg.language === "string") setLanguage(msg.language);
          if (seg.text) onSegmentRef.current?.(seg);
          break;
        }
        case "language":
          if (typeof msg.language === "string") setLanguage(msg.language);
          break;
        case "done": {
          const finalText =
            typeof msg.text === "string" ? msg.text.trim() : "";
          // Le `done` de Gladia ne porte pas la langue : on retombe sur celle
          // déjà détectée pendant la session plutôt que de renvoyer null.
          const lang =
            typeof msg.language === "string" ? msg.language : languageRef.current;
          if (finalText) setTranscript(finalText);
          if (lang) setLanguage(lang);
          setPartial("");
          onDoneRef.current?.({ text: finalText, language: lang });
          finalizeStop();
          break;
        }
        case "error": {
          const code = typeof msg.code === "string" ? msg.code : null;
          const raw = typeof msg.message === "string" ? msg.message : null;
          console.error("Voice-server error event:", code, raw);
          failWith("server_error", describeVoiceServerError(code, raw));
          break;
        }
        default:
          break;
      }
    },
    [failWith, finalizeStop, requestServerStop],
  );

  const start = useCallback(async () => {
    if (status === "connecting" || status === "listening" || status === "stopping")
      return;

    setError(null);

    if (!serverUrl || !token) {
      const msg = "La dictée vocale n'est pas configurée.";
      setStatus("error");
      setError(msg);
      onErrorRef.current?.({ code: "config_missing", message: msg });
      return;
    }

    const gen = ++genRef.current;
    stoppingRef.current = false;
    readyRef.current = false;
    stopRequestedRef.current = false;
    pendingFramesRef.current = [];
    setStatus("connecting");
    setTranscript("");
    setPartial("");
    setSegments([]);
    setLanguage(null);
    setLevel(0);

    // Filet de sécurité : pas de `ready` dans les temps => erreur explicite
    // (annulé à la réception du `ready`, ou par tout teardown).
    readyTimerRef.current = setTimeout(() => {
      failWith(
        "connect_failed",
        "Le serveur vocal ne répond pas. Réessayez dans quelques secondes.",
      );
    }, READY_TIMEOUT_MS);

    try {
      // 1. AudioContext + worklet (rapide, sans micro) : donne le sampleRate et
      //    prépare le nœud d'encodage avant même l'autorisation micro.
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      let ctx: AudioContext;
      try {
        ctx = new Ctor({ sampleRate: sampleRate ?? 16000 });
      } catch {
        ctx = new Ctor();
      }
      audioContextRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      if (gen !== genRef.current) return;

      const blob = new Blob([PCM_WORKLET_SOURCE], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      workletUrlRef.current = url;
      await ctx.audioWorklet.addModule(url);
      if (gen !== genRef.current) return;

      // Le sample rate demandé n'est pas toujours honoré (fallback
      // `new Ctor()` sans argument, contraintes du device) : si le taux obtenu
      // n'est pas dans la liste du moteur, la session live est impossible sur
      // cet appareil. On abandonne avec `connect_failed`, qui fait basculer le
      // composer sur le STT batch (MediaRecorder, insensible au taux) plutôt
      // que de réessayer indéfiniment un live voué à échouer.
      const actualRate = Math.round(ctx.sampleRate);
      if (!isSupportedRate(actualRate, provider)) {
        failWith(
          "connect_failed",
          "La dictée en direct n'est pas disponible sur cet appareil.",
        );
        return;
      }
      const frameSamples = Math.max(256, Math.round(ctx.sampleRate * 0.1)); // ~100 ms

      const node = new AudioWorkletNode(ctx, PCM_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: { frameSamples },
      });
      workletRef.current = node;

      node.port.onmessage = (e: MessageEvent) => {
        if (stoppingRef.current) return;
        const data = e.data as ArrayBuffer;

        // Niveau micro (RMS) pour l'UI — calculé même pendant le warm-up.
        const samples = new Int16Array(data);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const f = samples[i] / 0x8000;
          sum += f * f;
        }
        updateLevel(samples.length ? Math.sqrt(sum / samples.length) : 0);

        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN && readyRef.current) {
          // Backpressure basique : on saute la trame si le buffer d'envoi enfle.
          if (ws.bufferedAmount < 1_000_000) ws.send(data);
        } else {
          // Pas encore prêt : on bufferise pour ne rien perdre (plafonné).
          const pending = pendingFramesRef.current;
          pending.push(data);
          if (pending.length > MAX_PENDING_FRAMES) pending.shift();
        }
      };

      // Nœud relié à destination (sortie silencieuse) pour garder le graphe
      // actif ; la source micro est branchée plus bas.
      node.connect(ctx.destination);

      // 2. WebSocket ouvert EN PARALLÈLE de l'acquisition micro (warm-up plus
      //    court ; `start` est envoyé dès l'ouverture).
      const ws = new WebSocket(buildRealtimeUrl(serverUrl, token, provider));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (gen !== genRef.current) return;
        ws.send(
          JSON.stringify(
            buildStartMessage(provider, actualRate, optionsRef.current),
          ),
        );
      };
      ws.onmessage = (event) => {
        if (gen === genRef.current) handleServerMessage(event);
      };
      ws.onerror = () => {
        if (gen !== genRef.current) return;
        // NB : un upgrade rejeté par le serveur (token invalide, origine non
        // allowlistée, limite de sessions) arrive ici en échec opaque — la
        // cause exacte n'est visible que dans les logs du voice-server.
        failWith(
          readyRef.current ? "server_error" : "connect_failed",
          readyRef.current
            ? "La connexion au serveur vocal a été interrompue."
            : "Impossible de joindre le serveur vocal. Réessayez dans quelques secondes.",
        );
      };
      ws.onclose = (event) => {
        if (gen !== genRef.current) return;
        if (!stoppingRef.current) {
          const fallback = readyRef.current
            ? "La connexion au serveur vocal a été interrompue."
            : "Impossible de joindre le serveur vocal. Réessayez dans quelques secondes.";
          failWith(
            readyRef.current ? "server_error" : "connect_failed",
            describeVoiceServerClose(event.code, event.reason, fallback),
          );
        }
      };

      // 3. Micro (partie la plus lente, surtout la 1re autorisation) : dès que le
      //    flux est là, on branche la source. Les trames partent en direct si
      //    `ready` est déjà arrivé, sinon elles sont bufferisées puis flushées.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (gen !== genRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(node);
    } catch (err) {
      if (gen !== genRef.current) return;
      console.error("Live transcription setup failed:", err);
      failWith("mic_error", describeMicrophoneError(err));
    }
  }, [
    status,
    serverUrl,
    token,
    provider,
    sampleRate,
    updateLevel,
    handleServerMessage,
    failWith,
  ]);

  const stop = useCallback(() => {
    if (status !== "connecting" && status !== "listening") return;
    stoppingRef.current = true;

    // Couper l'entrée audio : plus aucune nouvelle trame n'est captée (l'audio
    // déjà bufferisé est conservé).
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* noop */
    }

    if (readyRef.current) {
      // Session active : le buffer a déjà été flushé au `ready`, on finalise.
      requestServerStop();
    } else {
      // Warm-up pas terminé : on diffère le stop jusqu'au `ready`, qui flushera
      // l'audio capté avant de finaliser. Si `ready` n'arrive jamais (serveur
      // injoignable), on le signale : la dictée est perdue, l'utilisateur doit
      // le savoir au lieu d'un retour silencieux à l'idle.
      stopRequestedRef.current = true;
      setStatus("stopping");
      setLevel(0);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      doneTimerRef.current = setTimeout(
        () =>
          failWith(
            "connect_failed",
            "Le serveur vocal n'a pas répondu, la dictée n'a pas pu être transcrite.",
          ),
        6000,
      );
    }
  }, [status, requestServerStop, failWith]);

  const reset = useCallback(() => {
    if (
      status === "connecting" ||
      status === "listening" ||
      status === "stopping"
    )
      return;
    setTranscript("");
    setPartial("");
    setSegments([]);
    setLanguage(null);
    setError(null);
    setLevel(0);
    setStatus("idle");
  }, [status]);

  // Réveille le serveur (cold start Railway) sans ouvrir de session : un simple
  // ping /healthz. À appeler sur un signal d'intention (ouverture du chat, retour
  // sur l'onglet) pour que le conteneur soit chaud au moment de parler. Throttlé.
  const prewarm = useCallback(() => {
    if (!serverUrl) return;
    const now = Date.now();
    if (now - lastPrewarmRef.current < 30_000) return;
    lastPrewarmRef.current = now;
    const base = serverUrl
      .trim()
      .replace(/\/+$/, "")
      .replace(/^ws:/i, "http:")
      .replace(/^wss:/i, "https:");
    const url = /^https?:/i.test(base) ? base : `https://${base}`;
    // no-cors : on ne lit pas la réponse, on veut juste sortir le serveur du sommeil.
    void fetch(`${url}/healthz`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
    }).catch(() => {});
  }, [serverUrl]);

  // Teardown au démontage.
  useEffect(() => () => teardownAll(), [teardownAll]);

  return {
    status,
    transcript,
    partial,
    liveText: joinText(transcript, partial),
    segments,
    language,
    level,
    error,
    isListening: status === "listening",
    start,
    stop,
    reset,
    prewarm,
  };
}
