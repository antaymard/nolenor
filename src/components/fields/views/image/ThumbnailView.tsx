import { TbPhoto } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { parseImageValue } from "@/components/fields/shared/imageValue";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Tailles fixes (et non un pourcentage) : une miniature doit rester une
// miniature quelle que soit la largeur du placement qui la contient.
const THUMB_SIZE: Record<string, string> = {
  sm: "size-10",
  md: "size-16",
  lg: "size-24",
};

export default function ImageThumbnailView({
  field,
  value,
  options,
}: FieldViewProps) {
  const image = parseImageValue(value);
  const size =
    typeof options?.size === "string" && options.size in THUMB_SIZE
      ? THUMB_SIZE[options.size]
      : THUMB_SIZE.md;

  if (!image) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-dashed border-gray-300 text-muted-foreground/70",
          size,
        )}
        title={field.name}
      >
        <TbPhoto size={14} />
      </div>
    );
  }

  return (
    <img
      src={image.url}
      alt={field.name}
      className={cn("rounded-md object-cover", size)}
      draggable={false}
    />
  );
}
