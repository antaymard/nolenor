#!/usr/bin/env node
/**
 * Smoke test for the speech gateway — lets you validate the backend with no
 * frontend. Streams an audio file to the gateway over WebSocket and prints the
 * live transcript, reconstructing it the same way the React hook will.
 *
 * Usage:
 *   node scripts/test-file.mjs <audio-file> [--url <ws-url>] [--token <token>] [--chunkMs 100]
 *
 * The file must be raw PCM (.pcm/.raw, s16le 16kHz mono) OR any format ffmpeg
 * can read (ffmpeg is invoked automatically when present). To pre-convert:
 *   ffmpeg -i input.mp3 -f s16le -ar 16000 -ac 1 output.pcm
 *
 * Requires Node 22+ (global WebSocket).
 */
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

const url = flag("url", "ws://localhost:8787/v1/stt/realtime");
const token = flag("token", process.env.GATEWAY_TOKEN ?? "dev-secret-token");
const chunkMs = Number(flag("chunkMs", "100"));

if (!file) {
  console.error("Usage: node scripts/test-file.mjs <audio-file> [--url] [--token] [--chunkMs]");
  process.exit(1);
}

async function loadPcm(path) {
  if (path.endsWith(".pcm") || path.endsWith(".raw")) return readFile(path);
  return new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-i", path, "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const chunks = [];
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.on("error", () =>
      reject(new Error("ffmpeg not found — pass a raw .pcm file (s16le 16k mono) instead.")),
    );
    ff.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error("ffmpeg conversion failed")),
    );
  });
}

const pcm = await loadPcm(file);
console.log(`Loaded ${pcm.length} bytes of PCM16 @16k mono (~${(pcm.length / 32000).toFixed(1)}s)`);

const wsUrl = `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
const ws = new WebSocket(wsUrl);
ws.binaryType = "arraybuffer";

// Live transcript reconstruction (mirrors the future React hook).
let committed = "";
let live = "";
const render = () => process.stdout.write(`\r${committed}${live}\x1b[K`);

ws.addEventListener("open", () => console.log("Connected — waiting for `ready`..."));

ws.addEventListener("message", async (ev) => {
  const msg = JSON.parse(ev.data);
  switch (msg.type) {
    case "ready": {
      console.log(`Ready (model=${msg.model}). Streaming audio...\n`);
      const bytesPerChunk = Math.max(2, Math.round((32000 * chunkMs) / 1000)) & ~1;
      for (let off = 0; off < pcm.length; off += bytesPerChunk) {
        ws.send(pcm.subarray(off, off + bytesPerChunk));
        await new Promise((r) => setTimeout(r, chunkMs));
      }
      ws.send(JSON.stringify({ type: "stop" }));
      break;
    }
    case "delta":
      live += msg.text;
      render();
      break;
    case "final":
      committed += msg.text ?? live;
      live = "";
      render();
      break;
    case "language":
      console.log(`\n[language] ${msg.language}`);
      break;
    case "error":
      console.error(`\n[error] ${msg.code ?? ""} ${msg.message}`);
      break;
    case "closed":
      console.log(`\n[closed] ${msg.reason ?? ""}`);
      ws.close();
      break;
  }
});

ws.addEventListener("close", () => {
  console.log(`\n\nFinal transcript:\n${committed}${live}`);
  process.exit(0);
});
ws.addEventListener("error", (e) => {
  console.error("WebSocket error:", e.message ?? e);
  process.exit(1);
});
