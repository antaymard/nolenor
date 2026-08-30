import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Configuration du client R2
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL!; // ex: https://files.entropie.app

export interface PresignedUpload {
  url: string;
  /**
   * En-têtes que le client DOIT envoyer tels quels sur son PUT. Ils font partie
   * de la signature : R2 rejette la requête si l'un d'eux diffère.
   */
  headers: Record<string, string>;
}

export async function generatePresignedUrl(
  key: string,
  {
    mimeType,
    size,
    disposition,
  }: { mimeType: string; size: number; disposition: "inline" | "attachment" },
): Promise<PresignedUpload> {
  const contentDisposition = disposition === "inline" ? "inline" : "attachment";

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: mimeType,
    ContentLength: size,
    ContentDisposition: contentDisposition,
  });

  // `content-type` et `content-disposition` sont retirés de la signature par
  // défaut par le presigner S3 : sans ce `signableHeaders`, le client pourrait
  // envoyer ce qu'il veut et la validation côté Convex ne servirait à rien.
  // `content-length` signé fait respecter la taille par R2 lui-même.
  const url = await getSignedUrl(r2Client, command, {
    expiresIn: 900, // 15 minutes
    signableHeaders: new Set([
      "content-type",
      "content-length",
      "content-disposition",
    ]),
  });

  return {
    url,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": contentDisposition,
    },
  };
}

/**
 * Un nom de fichier sûr à poser dans un en-tête `Content-Disposition`.
 *
 * Le guillemet fermerait la valeur entre quotes, et un CR/LF terminerait
 * l'en-tête : les deux laissent injecter ce qu'on veut dans la réponse. On
 * garde donc le même jeu de caractères que les clés d'upload
 * (`buildUpload`), et on borne la longueur.
 */
function sanitizeDispositionFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return cleaned.length > 0 ? cleaned : "download";
}

/**
 * URL présignée de lecture qui force le téléchargement.
 *
 * Les objets sont servis en `Content-Disposition: inline` (cf.
 * `uploadsConfig`), donc un simple lien vers l'URL publique se contente de
 * lire le média dans un onglet. Le seul moyen de télécharger était de
 * rapatrier le fichier en `fetch` puis d'en faire un blob — soit, pour une
 * vidéo de 500 Mo, tout le fichier en mémoire. `ResponseContentDisposition`
 * demande à R2 de renvoyer l'en-tête voulu au moment du GET : le navigateur
 * télécharge en streaming, sans que rien ne transite par le JS.
 */
export async function generatePresignedDownloadUrl(
  key: string,
  filename: string,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${sanitizeDispositionFilename(
      filename,
    )}"`,
  });

  return getSignedUrl(r2Client, command, { expiresIn: 900 });
}

// Directly upload a buffer to R2 and return the public URL
// (bypassing presigned URL step, for server-side uploads)
export async function uploadBuffer(
  key: string,
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: new Uint8Array(buffer),
    ContentType: mimeType,
  });
  await r2Client.send(command);
  return getPublicUrl(key);
}

export function getPublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  console.log(`[deleteObject] Deleting R2 object with key: ${key}`);
  await r2Client.send(command);
  console.log(`[deleteObject] Successfully deleted R2 object with key: ${key}`);
}
