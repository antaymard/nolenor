# speech-gateway

Edge **WebSocket gateway for realtime speech-to-text**, deployed as a Cloudflare
Worker and reusable across all your React apps. It keeps your Mistral API key
server-side and relays live audio to **Mistral Voxtral** realtime transcription,
exposing a small, provider-agnostic protocol to the frontend.

> TTS (text-to-speech) will live behind the same gateway later (e.g. `/v1/tts/...`).

## Why a gateway?

The Mistral realtime API needs your secret API key, which must never ship to the
browser. The gateway is a thin relay:

```
React app  ──WS(PCM16)──▶  speech-gateway (Cloudflare Worker)  ──WS+key──▶  Mistral Voxtral
           ◀──events────                                        ◀──events──
```

It also handles auth (per-app token + origin allowlist), buffering until the
upstream session is ready, and normalizing provider events into a stable schema
so the frontend (and future providers) don't care about Mistral specifics.

## Architecture

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Routing, CORS, auth gate, WebSocket upgrade |
| `src/auth.ts` | Token extraction + origin allowlist |
| `src/cors.ts` | Origin parsing / CORS headers |
| `src/stt/protocol.ts` | Normalized client↔gateway message types |
| `src/stt/mistral.ts` | Mistral adapter: URL, `session.update`, event normalization |
| `src/stt/relay.ts` | The relay: browser ↔ Mistral, audio buffering |

## Audio format

Mistral realtime expects **raw PCM, signed 16-bit little-endian, 16 kHz, mono**
(`pcm_s16le`). The browser must downsample mic audio to this before sending
(the React hook will do it via an `AudioWorklet`).

## Client ↔ Gateway protocol

Connect to `wss://<your-worker>/v1/stt/realtime?token=<token>` (optionally
`&model=`, `&delayMs=`, `&language=`).

**Browser → Gateway**
- **Binary frames**: raw PCM16 bytes (preferred).
- `{"type":"audio","data":"<base64 PCM16>"}` — fallback if binary is unavailable.
- `{"type":"flush"}` — ask the model to emit pending text now.
- `{"type":"stop"}` — signal end of input.

**Gateway → Browser** (`GatewayEvent`)
- `{"type":"ready","model","sampleRate","encoding"}` — start streaming audio.
- `{"type":"delta","text"}` — append to the current (not-yet-final) hypothesis.
- `{"type":"segment","text","startSec?","endSec?"}` — a timed segment.
- `{"type":"language","language"}` — detected language.
- `{"type":"final","text?"}` — utterance complete; see below.
- `{"type":"error","message","code?"}` / `{"type":"closed","reason?"}`

### Retrospective correction

Voxtral uses a delay buffer (`delayMs`, default 480 ms) so `delta`s are mostly
append-only. The protocol still supports correction for robustness and for
future providers (Deepgram/AssemblyAI revise text): keep a `committed` string
and a `live` string. Append `delta` to `live`; on `final`, replace `live` with
`final.text` if provided (authoritative — may differ from the deltas), otherwise
promote `live` into `committed`. See `scripts/test-file.mjs` for a reference
implementation.

## Configuration

Set in `wrangler.jsonc` (`vars`) or as secrets:

| Name | Kind | Default | Notes |
| --- | --- | --- | --- |
| `MISTRAL_API_KEY` | secret | — | `wrangler secret put MISTRAL_API_KEY` |
| `GATEWAY_TOKENS` | secret | — | Comma-separated; one token per app |
| `ALLOWED_ORIGINS` | var | localhost | Comma-separated; `*` for dev only |
| `MISTRAL_MODEL` | var | `voxtral-mini-2601` | Realtime model |
| `MISTRAL_BASE_URL` | var | `https://api.mistral.ai` | |
| `DEFAULT_DELAY_MS` | var | `480` | 80–1200 (×80) or 2400 |
| `DEBUG` | var | — | `"true"` logs raw upstream events |

## Local development

```bash
cd speech-gateway
npm install
cp .dev.vars.example .dev.vars   # then edit MISTRAL_API_KEY + GATEWAY_TOKENS
npm run dev                      # wrangler dev on http://localhost:8787
```

Smoke-test the backend without a frontend:

```bash
# any file ffmpeg can read, or a raw .pcm (s16le 16k mono)
npm run test:client -- ./sample.mp3 --token dev-secret-token
```

## Deploy

```bash
npm run deploy
wrangler secret put MISTRAL_API_KEY
wrangler secret put GATEWAY_TOKENS
```

## Notes & limits

- A plain Worker holds the relay open for the WebSocket's lifetime — fine for
  dictation. For very long-lived / high-scale sessions, migrate the relay into a
  **Durable Object** (WebSocket Hibernation) without changing the client protocol.
- `input_audio_buffer.append` / `session.update` are confirmed against the
  official SDK; `flush`/`end` follow the same namespace and are best-effort.
- Auth tokens travel in the WS URL (`?token=`) or `Sec-WebSocket-Protocol`.
  Always use `wss://` in production so they're encrypted in transit.
