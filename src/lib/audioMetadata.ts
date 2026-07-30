/** Beyond this, don't bother parsing tags — the file is not a tagged track. */
const MAX_PARSE_BYTES = 60 * 1024 * 1024;

/** Cover art is routinely 1400px and over a megabyte; a node shows it at 56px. */
const MAX_COVER_SIZE = 256;

export interface AudioFileMetadata {
  title?: string;
  artist?: string;
  cover?: { blob: Blob; mimeType: string };
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Shrinks cover art to something a thumbnail actually needs, so we neither
 * store nor download a megabyte to draw a 56px square.
 */
async function downscaleCover(
  data: Uint8Array,
  mimeType: string,
): Promise<{ blob: Blob; mimeType: string } | undefined> {
  const source = new Blob([data as BlobPart], { type: mimeType });
  const bitmap = await createImageBitmap(source);

  try {
    const scale = Math.min(
      1,
      MAX_COVER_SIZE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { blob: source, mimeType };
    context.drawImage(bitmap, 0, 0, width, height);

    const encoded = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/webp", 0.85);
    });
    if (encoded) return { blob: encoded, mimeType: "image/webp" };

    const jpeg = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), "image/jpeg", 0.85);
    });
    if (jpeg) return { blob: jpeg, mimeType: "image/jpeg" };

    // Both encodings refused: the original is still better than nothing.
    return { blob: source, mimeType };
  } finally {
    bitmap.close();
  }
}

/**
 * Reads the title, artist and cover art embedded in an audio file's tags.
 *
 * Deliberately best-effort: a corrupt tag or an undecodable picture must still
 * leave a perfectly usable audio node, just without a thumbnail.
 *
 * `music-metadata` is imported dynamically so its parsers never reach the
 * canvas bundle — this only runs when someone adds a file.
 */
export async function extractAudioMetadata(
  file: File,
): Promise<AudioFileMetadata> {
  if (file.size > MAX_PARSE_BYTES) return {};

  try {
    const { parseBlob, selectCover } = await import("music-metadata");
    const metadata = await parseBlob(file, { duration: false });

    const result: AudioFileMetadata = {
      title: clean(metadata.common.title),
      artist: clean(metadata.common.artist),
    };

    // selectCover knows how to pick the front cover when a file embeds
    // several pictures (back cover, artist shot, and so on).
    const picture = selectCover(metadata.common.picture);
    if (picture?.data && picture.data.length > 0) {
      try {
        result.cover = await downscaleCover(
          picture.data,
          picture.format || "image/jpeg",
        );
      } catch (error) {
        console.warn("[audioMetadata] cover could not be decoded", error);
      }
    }

    return result;
  } catch (error) {
    console.warn("[audioMetadata] tags could not be read", error);
    return {};
  }
}
