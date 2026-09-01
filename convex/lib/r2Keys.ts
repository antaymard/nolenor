import type { Doc } from "../_generated/dataModel";
import { collectR2KeysForTemplateValues } from "../config/fieldConfig";

function keyOf(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== "object") return null;
  const key = (candidate as Record<string, unknown>).key;
  return typeof key === "string" && key.length > 0 ? key : null;
}

/**
 * Every R2 storage key a nodeData refers to.
 *
 * Single source of truth for the two places that care: registering references
 * on create and reconciling them on update — deletion reads the reference rows
 * themselves, never the values. Adding a file-bearing node type means adding a
 * branch here and nowhere else.
 *
 * A custom node holds its file-bearing fields in its template, so its keys can
 * only be read with the template in hand. Without one (deleted template, race)
 * it reports nothing: the references it already holds stay untouched, so the
 * cost is a blob that lingers, never one deleted from under another node.
 */
export function extractR2Keys(
  nodeData: Pick<Doc<"nodeDatas">, "type" | "values">,
  template?: Pick<Doc<"nodeTemplates">, "fields"> | null,
): string[] {
  const values = nodeData.values ?? {};
  const keys: string[] = [];

  switch (nodeData.type) {
    case "pdf": {
      const files = values.files;
      if (Array.isArray(files)) {
        for (const file of files) {
          const key = keyOf(file);
          if (key) keys.push(key);
        }
      }
      break;
    }

    case "audio": {
      const audio = values.audio;
      const key = keyOf(audio);
      if (key) keys.push(key);
      // Cover art is a second blob of its own, extracted from the file's tags.
      if (audio && typeof audio === "object") {
        const coverKey = keyOf((audio as Record<string, unknown>).cover);
        if (coverKey) keys.push(coverKey);
      }
      break;
    }

    case "video": {
      const video = values.video;
      const key = keyOf(video);
      if (key) keys.push(key);
      // The poster is a second blob of its own, captured from the file at
      // upload time.
      if (video && typeof video === "object") {
        const posterKey = keyOf((video as Record<string, unknown>).poster);
        if (posterKey) keys.push(posterKey);
      }
      break;
    }

    case "image": {
      const images = values.images;
      if (Array.isArray(images)) {
        const publicUrlBase = process.env.R2_PUBLIC_URL;
        for (const image of images) {
          const key = keyOf(image);
          if (key) {
            keys.push(key);
            continue;
          }
          // Images uploaded before `key` was stored only carry the public URL.
          if (!publicUrlBase || !image || typeof image !== "object") continue;
          const url = (image as Record<string, unknown>).url;
          const prefix = `${publicUrlBase}/`;
          if (typeof url === "string" && url.startsWith(prefix)) {
            keys.push(url.slice(prefix.length));
          }
        }
      }
      break;
    }

    case "custom": {
      if (template) {
        keys.push(...collectR2KeysForTemplateValues(template, values));
      }
      break;
    }
  }

  return [...new Set(keys)];
}
