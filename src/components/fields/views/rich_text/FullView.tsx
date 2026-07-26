import DocumentStaticField from "@/components/fields/document-fields/DocumentStaticField";
import { parseRichTextDoc } from "@/components/fields/shared/richTextDoc";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Lecture seule (viewer, preview builder) : rendu statique complet, pas
// virtualisé (contrairement à l'excerpt du node).
export default function RichTextFullView({ field, value }: FieldViewProps) {
  const doc = parseRichTextDoc(value);

  if (!doc) {
    return (
      <span className="block text-sm text-muted-foreground/60 italic px-0.5">
        {field.name}
      </span>
    );
  }

  return <DocumentStaticField value={{ doc }} preview />;
}
