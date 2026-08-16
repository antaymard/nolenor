import type { NodeType } from "@/types/domain";

const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
];

const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".txt"];

function hasExtension(filename: string, extensions: string[]): boolean {
  const lower = filename.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

/**
 * Check if a URL points to an image based on file extension
 */
export function isImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Le node à créer pour un fichier collé ou déposé. On regarde d'abord le type
 * MIME, puis l'extension : les fichiers glissés depuis certains explorateurs
 * arrivent avec un `type` vide, et `text/plain` est parfois annoncé pour un
 * `.csv`.
 *
 * Le node `pdf` sert de porte-fichier générique (son `UploadFile` accepte déjà
 * bien plus que du PDF), c'est donc lui qui récupère tout le reste.
 */
export function resolveFileNodeType(file: {
  type: string;
  name: string;
}): NodeType {
  const { type, name } = file;

  if (type.startsWith("image/") || hasExtension(name, IMAGE_EXTENSIONS)) {
    return "image";
  }
  if (type.startsWith("audio/")) {
    return "audio";
  }
  if (type === "text/csv" || hasExtension(name, [".csv"])) {
    return "table";
  }
  if (
    type === "text/markdown" ||
    type === "text/plain" ||
    hasExtension(name, MARKDOWN_EXTENSIONS)
  ) {
    return "blocknote";
  }
  return "pdf";
}
