import { useFileUpload } from "../../hooks/useFilesUpload";

interface UploadFileProps {
  onUploadComplete: (fileData: {
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    uploadedAt: number;
    key: string;
  }) => void;
  accept?: string;
}

export const UploadFile = ({ onUploadComplete, accept }: UploadFileProps) => {
  const { uploadFile, uploads } = useFileUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileData = await uploadFile(file);
      onUploadComplete(fileData);
    } catch (error) {
      console.error("Upload failed:", error);
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
        disabled={isUploading}
        className="block w-full text-sm text-muted-foreground
          file:mr-4 file:py-2 file:px-4
          file:rounded file:border-0
          file:text-sm file:font-semibold
          file:bg-(--brand)/10 file:text-(--brand)
          hover:file:bg-(--brand)/15
          disabled:opacity-50"
      />

      {uploadList.length > 0 && (
        <div className="space-y-1">
          {uploadList.map(([fileId, upload]) => (
            <div key={fileId} className="text-sm">
              <div className="flex justify-between text-foreground">
                <span className="truncate">{upload.filename}</span>
                <span>
                  {upload.status === "uploading" &&
                    `${Math.round(upload.progress)}%`}
                  {upload.status === "done" && "✓"}
                  {upload.status === "error" && "✗"}
                </span>
              </div>
              {upload.status === "uploading" && (
                <div className="w-full bg-accent rounded-full h-1.5">
                  <div
                    className="bg-(--brand) h-1.5 rounded-full transition-all"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              )}
              {upload.status === "error" && upload.error && (
                <p className="text-xs text-destructive">{upload.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
