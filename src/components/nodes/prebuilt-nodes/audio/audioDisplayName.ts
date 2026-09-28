import type { AudioValue } from "../AudioNode";

/**
 * Mirrors getNodeDataTitle's precedence: what the user typed, then the file's
 * own tags, then the filename.
 */
export function displayNameOf(audio: AudioValue | null): string {
  if (!audio) return "";
  if (audio.label?.trim()) return audio.label.trim();
  if (audio.title?.trim()) {
    const title = audio.title.trim();
    const artist = audio.artist?.trim();
    return artist ? `${artist} — ${title}` : title;
  }
  return audio.filename;
}
