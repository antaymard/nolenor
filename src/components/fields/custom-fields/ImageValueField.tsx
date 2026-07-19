import { useRef, useState } from "react";
import { TbPhoto, TbTrash, TbUpload } from "react-icons/tb";
import toast from "react-hot-toast";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { cn } from "@/lib/utils";
import { useFileUpload } from "@/hooks/useFilesUpload";
import type { FieldRenderProps } from "@/components/fields/registry/fieldRegistry";

// Value : { url, key? } | null — `key` uniquement pour les uploads R2
// (cascade de suppression) ; les URLs externes posées par l'agent n'en ont
// pas.

type ImageValue = { url: string; key?: string };

function parseImageValue(value: unknown): ImageValue | null {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as ImageValue).url === "string" &&
    (value as ImageValue).url.length > 0
  ) {
    return value as ImageValue;
  }
  return null;
}

export default function ImageValueField({
  field,
  value,
  surface,
  onCommit,
}: FieldRenderProps) {
  const image = parseImageValue(value);
  const { uploadFile } = useFileUpload();
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(file: File | undefined) {
    if (!file || !onCommit) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    setIsUploading(true);
    try {
      const uploaded = await uploadFile(file);
      onCommit({ url: uploaded.url, key: uploaded.key });
    } catch (error) {
      console.error(error);
      toast.error("Image upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  const canEdit = Boolean(onCommit);
  const showControls = canEdit && surface === "window";

  return (
    <div className="nodrag w-full min-w-0">
      {image ? (
        <div className="relative group/imagefield">
          <img
            src={image.url}
            alt={field.name}
            className={cn(
              "w-full rounded-md object-cover",
              surface === "node" ? "max-h-40" : "max-h-72 object-contain",
            )}
            draggable={false}
          />
          {showControls && (
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/imagefield:opacity-100 transition-opacity">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-6 w-6"
                title="Replace image"
                onClick={() => inputRef.current?.click()}
              >
                <TbUpload size={12} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-6 w-6 hover:text-destructive"
                title="Remove image"
                onClick={() => onCommit?.(null)}
              >
                <TbTrash size={12} />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={!canEdit || isUploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "w-full flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 text-muted-foreground/70",
            surface === "node" ? "py-3" : "py-6",
            canEdit && "hover:border-gray-400 hover:text-muted-foreground",
          )}
        >
          {isUploading ? <Spinner className="size-4" /> : <TbPhoto size={16} />}
          <span className="text-xs">
            {isUploading
              ? "Uploading…"
              : canEdit
                ? `Add ${field.name.toLowerCase()}`
                : field.name}
          </span>
        </button>
      )}
      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleFileSelected(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}
