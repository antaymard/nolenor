import {
  S3Client,
  PutObjectCommand,
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
