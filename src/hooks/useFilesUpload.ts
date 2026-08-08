import { useCallback, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import axios from "axios";

export interface FileUploadProgress {
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  filename: string;
}

export interface UploadedFileData {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
}

export const useFileUpload = () => {
  const generateUploadUrl = useAction(api.uploads.generateUploadUrl);
  const generateUploadUrls = useAction(api.uploads.generateUploadUrls);

  // Map de fileId -> progress
  const [uploads, setUploads] = useState<Record<string, FileUploadProgress>>(
    {}
  );

  /**
   * Upload un seul fichier vers R2
   * @returns Les données du fichier uploadé (à utiliser pour mettre à jour votre state local)
   */
  const uploadFile = useCallback(
    async (file: File, customId?: string): Promise<UploadedFileData> => {
      const fileId = customId || crypto.randomUUID();

      // Initialiser le tracking
      setUploads((prev) => ({
        ...prev,
        [fileId]: {
          progress: 0,
          status: "uploading",
          filename: file.name,
        },
      }));

      try {
        // 1. Générer URL signée via Convex action
        const { uploadUrl, publicUrl, key, headers } = await generateUploadUrl({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        });

        // 2. Upload vers R2 avec suivi de progression.
        // Les en-têtes viennent du serveur : ils font partie de la signature
        // (type, disposition), R2 refuse le PUT si on en change un.
        await axios.put(uploadUrl, file, {
          headers,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent =
                (progressEvent.loaded / progressEvent.total) * 100;
              setUploads((prev) => ({
                ...prev,
                [fileId]: { ...prev[fileId], progress: percent },
              }));
            }
          },
        });

        // 3. Marquer comme terminé
        setUploads((prev) => ({
          ...prev,
          [fileId]: { ...prev[fileId], status: "done", progress: 100 },
        }));

        // 4. Retourner les données du fichier (à utiliser dans votre state local)
        const fileData: UploadedFileData = {
          url: publicUrl,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          uploadedAt: Date.now(),
          key,
        };

        return fileData;
      } catch (error) {
        setUploads((prev) => ({
          ...prev,
          [fileId]: {
            ...prev[fileId],
            status: "error",
            error: error instanceof Error ? error.message : "Upload failed",
          },
        }));
        throw error;
      }
    },
    [generateUploadUrl]
  );

  /**
   * Upload plusieurs fichiers en parallèle
   * @returns Un tableau des données des fichiers uploadés
   */
  const uploadMultiple = useCallback(
    async (files: File[]): Promise<UploadedFileData[]> => {
      const fileIds = files.map(() => crypto.randomUUID());

      // Initialiser le tracking pour tous les fichiers
      setUploads((prev) => {
        const newUploads = { ...prev };
        fileIds.forEach((id, index) => {
          newUploads[id] = {
            progress: 0,
            status: "uploading",
            filename: files[index].name,
          };
        });
        return newUploads;
      });

      // 1. Générer toutes les URLs signées en une seule fois
      const uploadData = await generateUploadUrls({
        files: files.map((f) => ({
          filename: f.name,
          mimeType: f.type,
          size: f.size,
        })),
      });

      // 2. Upload tous les fichiers en parallèle
      const uploadPromises = files.map(async (file, index) => {
        const fileId = fileIds[index];
        const { uploadUrl, publicUrl, key, headers } = uploadData[index];

        try {
          await axios.put(uploadUrl, file, {
            headers,
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent =
                  (progressEvent.loaded / progressEvent.total) * 100;
                setUploads((prev) => ({
                  ...prev,
                  [fileId]: { ...prev[fileId], progress: percent },
                }));
              }
            },
          });

          setUploads((prev) => ({
            ...prev,
            [fileId]: { ...prev[fileId], status: "done", progress: 100 },
          }));

          return {
            url: publicUrl,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            uploadedAt: Date.now(),
            key,
          };
        } catch (error) {
          setUploads((prev) => ({
            ...prev,
            [fileId]: {
              ...prev[fileId],
              status: "error",
              error: error instanceof Error ? error.message : "Upload failed",
            },
          }));
          throw error;
        }
      });

      return await Promise.all(uploadPromises);
    },
    [generateUploadUrls]
  );

  /**
   * Nettoie le tracking d'un fichier spécifique
   */
  const clearUpload = useCallback((fileId: string) => {
    setUploads((prev) => {
      const newUploads = { ...prev };
      delete newUploads[fileId];
      return newUploads;
    });
  }, []);

  /**
   * Nettoie tous les fichiers terminés (done ou error)
   */
  const clearCompletedUploads = useCallback(() => {
    setUploads((prev) => {
      const newUploads = { ...prev };
      Object.keys(newUploads).forEach((id) => {
        if (
          newUploads[id].status === "done" ||
          newUploads[id].status === "error"
        ) {
          delete newUploads[id];
        }
      });
      return newUploads;
    });
  }, []);

  return {
    uploadFile, // Single upload - retourne UploadedFileData
    uploadMultiple, // Multiple uploads - retourne UploadedFileData[]
    uploads, // Record<fileId, FileUploadProgress> - pour afficher la progression
    clearUpload, // Nettoyer un upload spécifique
    clearCompletedUploads, // Nettoyer tous les uploads terminés
  };
};
