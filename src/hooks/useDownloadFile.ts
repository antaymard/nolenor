import { useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { downloadExternalUrl, downloadPresignedUrl } from "@/lib/downloadFile";

export interface StoredFileRef {
  /** Clé R2. Absente pour les URLs externes (images fournies par l'agent). */
  key?: string;
  url: string;
  filename: string;
}

/**
 * Télécharge un fichier attaché à un nœud.
 *
 * Avec une clé, on demande au serveur une URL présignée qui force le
 * téléchargement. Sans clé — ou si cette demande échoue, par exemple parce que
 * l'objet n'est plus référencé — on retombe sur le rapatriement de l'URL
 * publique, qui reste correct pour les fichiers de taille raisonnable.
 */
export function useDownloadFile() {
  const generateDownloadUrl = useAction(api.uploads.generateDownloadUrl);

  const downloadStoredFile = useCallback(
    async ({ key, url, filename }: StoredFileRef): Promise<void> => {
      if (key) {
        try {
          const { url: presigned } = await generateDownloadUrl({
            key,
            filename,
          });
          downloadPresignedUrl(presigned);
          return;
        } catch (error) {
          console.warn(
            "[useDownloadFile] presigned download failed, falling back",
            error,
          );
        }
      }

      await downloadExternalUrl(url, filename);
    },
    [generateDownloadUrl],
  );

  return { downloadStoredFile };
}
