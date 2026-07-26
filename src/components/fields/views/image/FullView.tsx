import { TbPhoto } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { parseImageValue } from "@/components/fields/shared/imageValue";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

export default function ImageFullView({ field, value, surface }: FieldViewProps) {
  const image = parseImageValue(value);

  if (image) {
    return (
      <img
        src={image.url}
        alt={field.name}
        className={cn(
          "w-full rounded-md object-cover",
          surface === "node" ? "max-h-40" : "max-h-72 object-contain",
        )}
        draggable={false}
      />
    );
  }

  return (
    <div
      className={cn(
        "w-full flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 text-muted-foreground/70",
        surface === "node" ? "py-3" : "py-6",
      )}
    >
      <TbPhoto size={16} />
      <span className="text-xs">{field.name}</span>
    </div>
  );
}
