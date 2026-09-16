import {
  useFileUpload,
  type UploadedFileData,
} from "../../hooks/useFilesUpload";

interface UploadFileProps {
  onUploadComplete: (
    fileData: {
      url: string;
      filename: string;
      mimeType: string;
      size: number;
      uploadedAt: number;
      key: string;
    },
    // The original File, for callers that need to read more out of it than
    // the upload result carries — audio tags, for instance.
    file: File,
  ) => void;
  /**
   * Appelé une seule fois avec tous les fichiers réussis quand `multiple`
   * est actif. Si absent, on retombe sur un appel `onUploadComplete` par
   * fichier réussi.
   */
  onUploadsComplete?: (filesData: UploadedFileData[], files: File[]) => void;
  accept?: string;
  multiple?: boolean;
}

export const UploadFile = ({
  onUploadComplete,
  onUploadsComplete,
  accept,
  multiple,
}: UploadFileProps) => {
  const { uploadFile, uploads } = useFileUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files ?? []).filter((f) => f.size > 0);
    if (files.length === 0) return;

    try {
      if (!multiple) {
        const fileData = await uploadFile(files[0]);
        onUploadComplete(fileData, files[0]);
        return;
      }

      // Succès partiels : un fichier en échec ne doit pas faire perdre les
      // autres (`uploadMultiple` fait un `Promise.all` qui rejette tout).
      const results = await Promise.allSettled(
        files.map((file) => uploadFile(file)),
      );
      const succeededData: UploadedFileData[] = [];
      const succeededFiles: File[] = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          succeededData.push(result.value);
          succeededFiles.push(files[index]);
        } else {
          console.error(`Upload failed for ${files[index].name}:`, result.reason);
        }
      });
      if (succeededData.length === 0) return;
      if (onUploadsComplete) {
        onUploadsComplete(succeededData, succeededFiles);
      } else {
        succeededData.forEach((fileData, index) => {
          onUploadComplete(fileData, succeededFiles[index]);
        });
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      // Permet de re-sélectionner les mêmes fichiers juste après.
      input.value = "";
    }
  };

  const uploadList = Object.entries(uploads);
  const isUploading = uploadList.some((u) => u[1].status === "uploading");

  return (
    <div className="space-y-2">
      <input
        type="file"
        onChange={handleFileSelect}
        accept={accept}
        multiple={multiple}
        disabled={isUploading}
        className="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded file:border-0
          file:text-sm file:font-semibold
          file:bg-blue-50 file:text-blue-700
          hover:file:bg-blue-100
          disabled:opacity-50"
      />

      {uploadList.length > 0 && (
        <div className="space-y-1">
          {uploadList.map(([fileId, upload]) => (
            <div key={fileId} className="text-sm">
              <div className="flex justify-between text-gray-700">
                <span className="truncate">{upload.filename}</span>
                <span>
                  {upload.status === "uploading" &&
                    `${Math.round(upload.progress)}%`}
                  {upload.status === "done" && "✓"}
                  {upload.status === "error" && "✗"}
                </span>
              </div>
              {upload.status === "uploading" && (
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              )}
              {upload.status === "error" && upload.error && (
                <p className="text-xs text-red-600">{upload.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
