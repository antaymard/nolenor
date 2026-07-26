import DocumentStaticField from "@/components/fields/document-fields/DocumentStaticField";
import { parseRichTextDoc } from "@/components/fields/shared/richTextDoc";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Node canvas : rendu statique virtualisé, jamais d'éditeur Plate monté
// dans un node (cf. plan — l'édition passe par la window).
export default function RichTextExcerptView({ field, value }: FieldViewProps) {
  const doc = parseRichTextDoc(value);

  if (!doc) {
    return (
      <span className="block text-sm text-muted-foreground/60 italic px-0.5">
        {field.name}
      </span>
    );
  }

  return (
    <div className="min-h-0 overflow-hidden text-sm">
      <DocumentStaticField value={{ doc }} preview />
    </div>
  );
}
