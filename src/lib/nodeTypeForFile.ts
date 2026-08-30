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

/**
 * Les extensions vidéo qu'on reconnaît, y compris celles qu'aucun navigateur
 * ne décode : un `.mkv` reste une vidéo, et le node sait le dire et proposer
 * le téléchargement. Le router ailleurs rendrait le comportement illisible —
 * deux vidéos côte à côte deviendraient deux nodes différents.
 */
const VIDEO_EXTENSIONS = [
  ".mp4",
  ".m4v",
  ".mov",
  ".webm",
  ".ogv",
  ".mkv",
  ".avi",
  ".wmv",
  ".flv",
  ".mpg",
  ".mpeg",
  ".3gp",
];

/**
 * Le type MIME à annoncer à l'upload.
 *
 * `file.type` est vide pour beaucoup de fichiers glissés depuis un
 * explorateur — un `.mov` ou un `.mkv` sorti du Finder, typiquement. Comme
 * `resolveUploadPolicy` refuse un type vide, l'upload échouait pour ces
 * fichiers avant même de partir. On retombe donc sur l'extension.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".3gp": "video/3gpp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
};

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
  if (type.startsWith("video/") || hasExtension(name, VIDEO_EXTENSIONS)) {
    return "video";
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

/**
 * Le type MIME à envoyer avec ce fichier : celui que le navigateur annonce
 * quand il en annonce un, sinon celui que dit l'extension.
 */
export function mimeTypeForFile(file: { type: string; name: string }): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  const extension = Object.keys(MIME_BY_EXTENSION).find((ext) =>
    lower.endsWith(ext),
  );
  return extension ? MIME_BY_EXTENSION[extension] : "";
}
