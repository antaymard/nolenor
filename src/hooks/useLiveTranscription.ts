import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook de transcription LIVE (streaming) via le voice-server.
 *
 * Le navigateur capte le micro, le ré-encode en PCM s16le mono et l'envoie au
 * fil de l'eau sur un WebSocket `wss://<voice-server>/v1/realtime`. Le serveur
 * renvoie des `delta` (texte interim) puis des `segment` finalisés, et enfin un
 * `done` avec le transcript complet.
 *
 * Ce hook est "transport-only" : il reçoit `serverUrl` + `token` en paramètres.
 * Pour l'usage dans l'app, préférer `useNoleLiveTranscription` qui récupère la
 * config depuis Convex (token hors bundle).
 */

export type LiveTranscriptionStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "stopping"
  | "error";

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
  /** Latence cible (ms) envoyée au serveur, clampée 240–2400. Défaut 480. */
  targetDelayMs?: number;
  /** Sample rate de capture souhaité (Hz). Défaut 16000. */
  sampleRate?: number;
  /** Appelé à chaque segment finalisé. */
  onSegment?: (segment: TranscriptSegment) => void;
  /** Appelé quand le flux est finalisé (transcript complet). */
  onDone?: (result: { text: string; language: string | null }) => void;
  /** Appelé en cas d'erreur. */
  onError?: (message: string) => void;
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
}

const PCM_WORKLET_NAME = "nole-pcm-encoder";

// Plafond de trames bufferisées avant le `ready` serveur (~20 s à 100 ms/trame).
// Filet de sécurité contre une montée mémoire si `ready` n'arrive jamais.
const MAX_PENDING_FRAMES = 200;

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

function buildRealtimeUrl(base: string, token: string): string {
  let u = base.trim().replace(/\/+$/, "");
  u = u.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  if (!/^wss?:/i.test(u)) u = "wss://" + u;
  return `${u}/v1/realtime?token=${encodeURIComponent(token)}`;
}

function clampDelay(d: number | undefined): number {
  const n = d ?? 480;
  return Math.min(2400, Math.max(240, Math.round(n)));
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
  const { serverUrl, token, targetDelayMs, sampleRate } = options;

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
  const lastLevelRef = useRef(0);
  // Trames PCM captées avant le `ready` serveur : bufferisées puis flushées,
  // pour ne pas perdre la 1re phrase pendant le warm-up.
  const pendingFramesRef = useRef<ArrayBuffer[]>([]);

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
    (message: string) => {
      teardownAll();
      setStatus("error");
      setLevel(0);
      setError(message);
      onErrorRef.current?.(message);
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
      doneTimerRef.current = setTimeout(() => finalizeStop(), 5000);
    } else {
      finalizeStop();
    }
  }, [finalizeStop]);

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
        case "delta":
          if (typeof msg.text === "string") {
            const chunk = msg.text;
            setPartial((p) => p + chunk);
          }
          break;
        case "segment": {
          const seg: TranscriptSegment = {
            text: typeof msg.text === "string" ? msg.text : "",
            start: typeof msg.start === "number" ? msg.start : 0,
            end: typeof msg.end === "number" ? msg.end : 0,
          };
          setSegments((s) => [...s, seg]);
          setTranscript((t) => joinText(t, seg.text));
          setPartial("");
          if (seg.text) onSegmentRef.current?.(seg);
          break;
        }
        case "language":
          if (typeof msg.language === "string") setLanguage(msg.language);
          break;
        case "done": {
          const finalText =
            typeof msg.text === "string" ? msg.text.trim() : "";
          const lang =
            typeof msg.language === "string" ? msg.language : null;
          if (finalText) setTranscript(finalText);
          if (lang) setLanguage(lang);
          setPartial("");
          onDoneRef.current?.({ text: finalText, language: lang });
          finalizeStop();
          break;
        }
        case "error": {
          const message =
            (typeof msg.message === "string" && msg.message) ||
            (typeof msg.code === "string" && msg.code) ||
            "Erreur du voice-server.";
          failWith(message);
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
      const msg = "Voice-server non configuré (URL ou token manquant).";
      setStatus("error");
      setError(msg);
      onErrorRef.current?.(msg);
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

      const actualRate = Math.round(ctx.sampleRate);
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
      const ws = new WebSocket(buildRealtimeUrl(serverUrl, token));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (gen !== genRef.current) return;
        ws.send(
          JSON.stringify({
            type: "start",
            sampleRate: actualRate,
            targetDelayMs: clampDelay(targetDelayMs),
          }),
        );
      };
      ws.onmessage = (event) => {
        if (gen === genRef.current) handleServerMessage(event);
      };
      ws.onerror = () => {
        if (gen !== genRef.current) return;
        failWith("Connexion au voice-server échouée.");
      };
      ws.onclose = (event) => {
        if (gen !== genRef.current) return;
        if (!stoppingRef.current) {
          failWith(event.reason || "Connexion au voice-server interrompue.");
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
      const msg =
        err instanceof Error
          ? err.message
          : "Impossible d'accéder au micro ou au voice-server.";
      failWith(msg);
    }
  }, [
    status,
    serverUrl,
    token,
    sampleRate,
    targetDelayMs,
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
      // l'audio capté avant de finaliser. Filet de sécurité si `ready` n'arrive
      // jamais (serveur injoignable).
      stopRequestedRef.current = true;
      setStatus("stopping");
      setLevel(0);
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
      doneTimerRef.current = setTimeout(() => finalizeStop(), 6000);
    }
  }, [status, requestServerStop, finalizeStop]);

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
  };
}
