import type { Env } from "../env";
import {
  appendAudioMessage,
  buildSessionUpdate,
  connectUpstream,
  END_MESSAGE,
  FLUSH_MESSAGE,
  normalizeEvent,
  resolveOptions,
} from "./mistral";
import type { ClientMessage, GatewayEvent } from "./protocol";

/** Max audio chunks buffered while the upstream session is still opening. */
const MAX_QUEUE = 512;
/** Force-start if the upstream never sends `session.created`. */
const READY_FALLBACK_MS = 1500;

/** Encode raw audio bytes to base64 using only Worker-native APIs. */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function send(ws: WebSocket, event: GatewayEvent): void {
  try {
    ws.send(JSON.stringify(event));
  } catch {
    /* socket already closing */
  }
}

/**
 * Relay a browser WebSocket to a Mistral realtime transcription session.
 *
 * Browser -> Gateway: binary PCM16 frames (or `{type:"audio",data:base64}`) and
 * JSON control messages. Gateway -> Browser: normalized {@link GatewayEvent}s.
 */
export function handleSttSession(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Response {
  const opts = resolveOptions(url, env);
  const debug = env.DEBUG === "true";

  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();

  let upstream: WebSocket | null = null;
  let ready = false;
  let closed = false;
  const audioQueue: string[] = [];

  const closeAll = (code?: number, reason?: string) => {
    if (closed) return;
    closed = true;
    try {
      upstream?.close();
    } catch {
      /* noop */
    }
    try {
      server.close(code, reason?.slice(0, 120));
    } catch {
      /* noop */
    }
  };

  const enqueueAudio = (base64: string) => {
    if (upstream && ready) {
      upstream.send(appendAudioMessage(base64));
    } else if (audioQueue.length < MAX_QUEUE) {
      audioQueue.push(base64);
    }
  };

  // --- Browser -> Gateway ---
  server.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (typeof data === "string") {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data) as ClientMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case "audio":
          if (msg.data) enqueueAudio(msg.data);
          break;
        case "flush":
          if (upstream && ready) upstream.send(FLUSH_MESSAGE);
          break;
        case "stop":
          if (upstream && ready) upstream.send(END_MESSAGE);
          break;
        case "configure":
          // Config is applied at connect time via query params; live
          // re-config requires a reconnect. Accepted as a no-op for now.
          break;
      }
      return;
    }
    // Binary frame = raw PCM16 audio.
    if (data instanceof ArrayBuffer) {
      enqueueAudio(arrayBufferToBase64(data));
    }
  });

  server.addEventListener("close", () => {
    if (upstream && ready) {
      try {
        upstream.send(END_MESSAGE);
      } catch {
        /* noop */
      }
    }
    closeAll();
  });
  server.addEventListener("error", () => closeAll(1011, "client_error"));

  // --- Connect upstream, then wire Gateway <- Mistral ---
  const connect = async () => {
    try {
      upstream = await connectUpstream(env, opts);
    } catch (err) {
      send(server, {
        type: "error",
        message: (err as Error).message,
        code: "upstream_connect_failed",
      });
      closeAll(1011, "upstream_connect_failed");
      return;
    }

    const markReady = () => {
      if (ready || closed || !upstream) return;
      upstream.send(buildSessionUpdate(opts)); // configure before any audio
      ready = true;
      for (const b64 of audioQueue) upstream.send(appendAudioMessage(b64));
      audioQueue.length = 0;
      send(server, {
        type: "ready",
        model: opts.model,
        sampleRate: opts.sampleRate,
        encoding: opts.encoding,
      });
    };

    upstream.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      let raw: Record<string, unknown> & { type?: string };
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      if (debug) console.log("[stt upstream]", event.data);

      if (raw.type === "session.created") {
        markReady();
        return;
      }
      if (raw.type === "session.updated") return;

      const normalized = normalizeEvent(raw);
      if (normalized) send(server, normalized);
    });

    upstream.addEventListener("close", (event: CloseEvent) => {
      send(server, { type: "closed", reason: `upstream_closed:${event.code}` });
      closeAll();
    });
    upstream.addEventListener("error", () => {
      send(server, { type: "error", message: "upstream_error", code: "upstream_error" });
      closeAll(1011, "upstream_error");
    });

    // Some deployments may not emit session.created promptly — start anyway.
    setTimeout(() => {
      if (!closed) markReady();
    }, READY_FALLBACK_MS);
  };

  ctx.waitUntil(connect());

  // Echo a selected subprotocol if the client offered one (token-as-subprotocol).
  const offered = request.headers.get("Sec-WebSocket-Protocol");
  const headers: Record<string, string> = {};
  if (offered) {
    const first = offered.split(",")[0]?.trim();
    if (first) headers["Sec-WebSocket-Protocol"] = first;
  }

  return new Response(null, { status: 101, webSocket: client, headers });
}
