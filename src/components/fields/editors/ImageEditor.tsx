import { TbPhoto, TbTrash, TbUpload } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { cn } from "@/lib/utils";
import { parseImageValue } from "@/components/fields/shared/imageValue";
import { useImageFieldUpload } from "@/components/fields/shared/useImageFieldUpload";
import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

// Monté uniquement quand onCommit est présent (InlineShell, mode "direct") :
// toujours éditable ici, pas de branche lecture seule à gérer — elle vit dans
// ImageFullView.
export default function ImageEditor({
  field,
  value,
  surface,
  commit,
}: FieldEditorProps) {
  const image = parseImageValue(value);
  const { inputRef, isUploading, openPicker, onInputChange } =
    useImageFieldUpload(commit);

  const showControls = surface === "window";

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
                onClick={openPicker}
              >
                <TbUpload size={12} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-6 w-6 hover:text-destructive"
                title="Remove image"
                onClick={() => commit(null)}
              >
                <TbTrash size={12} />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={isUploading}
          onClick={openPicker}
          className={cn(
            "w-full flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 text-muted-foreground/70",
            surface === "node" ? "py-3" : "py-6",
            "hover:border-gray-400 hover:text-muted-foreground",
          )}
        >
          {isUploading ? <Spinner className="size-4" /> : <TbPhoto size={16} />}
          <span className="text-xs">
            {isUploading ? "Uploading…" : `Add ${field.name.toLowerCase()}`}
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  );
}
