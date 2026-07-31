import { TbExternalLink, TbPhoto } from "react-icons/tb";
import { parseImageValue } from "@/components/fields/shared/imageValue";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Dernier segment du chemin, sans query string — un nom de fichier lisible
// plutôt qu'une URL R2 signée de 200 caractères.
function imageLabel(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname;
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : fallback;
  } catch {
    return fallback;
  }
}

// edit:"none" : la vue n'est jamais interactive au sens du shell, mais le lien
// lui-même reste cliquable. stopPropagation pour que le clic n'aille pas
// sélectionner le node du canvas derrière.
export default function ImageLinkView({ field, value }: FieldViewProps) {
  const image = parseImageValue(value);

  if (!image) {
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground/60 italic px-0.5">
        <TbPhoto size={13} className="shrink-0" />
        <span className="truncate">{field.name}</span>
      </span>
    );
  }

  return (
    <a
      href={image.url}
      target="_blank"
      rel="noreferrer noopener"
      className="nodrag flex items-center gap-1 min-w-0 text-sm text-blue-600 hover:underline px-0.5"
      onClick={(e) => e.stopPropagation()}
      title={image.url}
    >
      <TbExternalLink size={13} className="shrink-0" />
      <span className="truncate">{imageLabel(image.url, field.name)}</span>
    </a>
  );
}
