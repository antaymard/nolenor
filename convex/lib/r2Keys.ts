import type { Doc } from "../_generated/dataModel";

function keyOf(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== "object") return null;
  const key = (candidate as Record<string, unknown>).key;
  return typeof key === "string" && key.length > 0 ? key : null;
}

/**
 * Every R2 storage key a nodeData refers to.
 *
 * Single source of truth for the three places that care: registering
 * references on create, reconciling them on update, and releasing them on
 * delete. Adding a file-bearing node type means adding a branch here and
 * nowhere else.
 */
export function extractR2Keys(
  nodeData: Pick<Doc<"nodeDatas">, "type" | "values">,
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
      const key = keyOf(values.audio);
      if (key) keys.push(key);
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
  }

  return [...new Set(keys)];
}
