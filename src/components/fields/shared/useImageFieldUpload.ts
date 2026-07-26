import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useFileUpload } from "@/hooks/useFilesUpload";

// Logique d'upload partagée par les éditeurs de champ image (full,
// thumbnail…) : input fichier caché, garde sur le type MIME, état
// d'upload. Le commit reste à l'appelant — c'est lui qui connaît la forme
// stockée attendue.
function useImageFieldUpload(commit: (value: unknown) => void) {
  const { uploadFile } = useFileUpload();
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleFileSelected = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are supported");
        return;
      }
      setIsUploading(true);
      try {
        const uploaded = await uploadFile(file);
        // `key` n'est posé que pour les uploads R2 : c'est lui qui permet la
        // purge de l'ancienne image au remplacement, et la cascade à la
        // suppression du node.
        commit({ url: uploaded.url, key: uploaded.key });
      } catch (error) {
        console.error(error);
        toast.error("Image upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [commit, uploadFile],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      void handleFileSelected(e.target.files?.[0]);
      // Remis à vide pour que re-sélectionner le MÊME fichier déclenche bien
      // un nouveau change.
      e.target.value = "";
    },
    [handleFileSelected],
  );

  return { inputRef, isUploading, openPicker, onInputChange };
}

export { useImageFieldUpload };
