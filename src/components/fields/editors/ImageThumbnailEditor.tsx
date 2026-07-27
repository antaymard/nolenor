import { TbPhoto, TbTrash, TbUpload } from "react-icons/tb";
import { Spinner } from "@/components/shadcn/spinner";
import { cn } from "@/lib/utils";
import { parseImageValue } from "@/components/fields/shared/imageValue";
import { useImageFieldUpload } from "@/components/fields/shared/useImageFieldUpload";
import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

// Même tailles que ImageThumbnailView : une miniature éditable doit occuper
// exactement la même place que sa version lecture seule, sinon basculer d'une
// permission à l'autre décalerait le layout.
const THUMB_SIZE: Record<string, string> = {
  sm: "size-10",
  md: "size-16",
  lg: "size-24",
};

// Pendant éditable de ImageThumbnailView : les contrôles sont en overlay au
// survol (une miniature est trop petite pour des boutons à côté), et sont
// disponibles sur les DEUX surfaces — contrairement au variant `full`, où
// remplacer/supprimer est réservé à la window faute de place sur le canvas.
export default function ImageThumbnailEditor({
  field,
  value,
  options,
  commit,
}: FieldEditorProps) {
  const image = parseImageValue(value);
  const { inputRef, isUploading, openPicker, onInputChange } =
    useImageFieldUpload(commit);

  const size =
    typeof options?.size === "string" && options.size in THUMB_SIZE
      ? THUMB_SIZE[options.size]
      : THUMB_SIZE.md;

  return (
    <div className="nodrag inline-block">
      {image ? (
        <div className={cn("relative group/thumb", size)}>
          <img
            src={image.url}
            alt={field.name}
            className={cn("rounded-md object-cover", size)}
            draggable={false}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-md bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
            <button
              type="button"
              title="Replace image"
              className="text-white/90 hover:text-white"
              onClick={openPicker}
            >
              <TbUpload size={13} />
            </button>
            <button
              type="button"
              title="Remove image"
              className="text-white/90 hover:text-red-300"
              onClick={() => commit(null)}
            >
              <TbTrash size={13} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isUploading}
          onClick={openPicker}
          title={`Add ${field.name.toLowerCase()}`}
          className={cn(
            "flex items-center justify-center rounded-md border border-dashed border-gray-300 text-muted-foreground/70 hover:border-gray-400 hover:text-muted-foreground",
            size,
          )}
        >
          {isUploading ? <Spinner className="size-4" /> : <TbPhoto size={14} />}
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
