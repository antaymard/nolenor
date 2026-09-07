import { useCallback } from "react";
import { useAction } from "convex/react";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import { mimeTypeForFile } from "@/lib/nodeTypeForFile";

/**
 * Adaptateur d'upload R2 pour BlockNote.
 *
 * BlockNote attend `uploadFile: (file: File) => Promise<string>` sur
 * `BlockNoteEditor.create` : sans elle, l'onglet "Upload" du File Panel est
 * absent et il ne reste que l'embed par URL — d'où paste/drag & drop morts
 * pour les blocs image/video/audio/file. Une fois fournie, BlockNote gère
 * lui-même le bouton Upload, le paste (ctrl-v) et le drag & drop.
 *
 * Le cycle réutilise `uploads.generateUploadUrl` (URL présignée PUT R2) :
 * les en-têtes serveur font partie de la signature et sont renvoyés tels
 * quels, body = File brut (jamais de FormData). Retourne la `publicUrl`
 * directement affichable en `inline` — pas de `resolveFileUrl` nécessaire.
 *
 * En cas d'échec (type bloqué type SVG, trop gros, réseau), on toast un
 * message lisible puis on re-throw pour que BlockNote garde le bloc en état
 * d'erreur plutôt qu'une URL cassée.
 */
export function useBlockNoteUpload(): (file: File) => Promise<string> {
  const generateUploadUrl = useAction(api.uploads.generateUploadUrl);

  return useCallback(
    async (file: File): Promise<string> => {
      const mimeType = mimeTypeForFile(file);
      try {
        const { uploadUrl, publicUrl, headers } = await generateUploadUrl({
          filename: file.name,
          mimeType,
          size: file.size,
        });

        const response = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers,
        });
        if (!response.ok) {
          throw new Error(`Upload failed (${response.status})`);
        }
        return publicUrl;
      } catch (error) {
        console.error("[BlockNote] R2 upload failed:", error);
        toast.error(
          error instanceof Error ? error.message : "File upload failed",
        );
        throw error;
      }
    },
    [generateUploadUrl],
  );
}
