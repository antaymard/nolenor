import { BlockNoteStatic } from "@/components/blocknote/BlockNoteStatic";
import { parseRichTextDoc } from "@/components/fields/shared/richTextDoc";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Lecture seule (viewer, preview du builder, canal différé absent) : document
// complet, non borné en hauteur — contrairement à l'extrait du node.
export default function RichTextFullView({ field, value }: FieldViewProps) {
  const doc = parseRichTextDoc(value);

  if (!doc) {
    return (
      <span className="block text-sm text-muted-foreground/60 italic px-0.5">
        {field.name}
      </span>
    );
  }

  return <BlockNoteStatic blocks={doc} className="text-sm" />;
}
