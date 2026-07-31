import { TbFileText } from "react-icons/tb";
import { parseRichTextDoc } from "@/components/fields/shared/richTextDoc";
import { extractInlineText } from "@/../convex/lib/blockNoteDocument";
import type { FieldViewProps } from "@/components/fields/fieldHostTypes";

// Première ligne de texte du document, comme aperçu d'une ligne.
function firstLine(value: unknown): string | null {
  const doc = parseRichTextDoc(value);
  if (!doc) return null;
  for (const block of doc) {
    const text = extractInlineText(block.content).trim();
    if (text.length > 0) return text;
  }
  return null;
}

// Monté par WindowEscalationShell (edit:"window") : c'est le SHELL qui porte
// le clic et le curseur, pas cette vue — elle reste pure. Quand l'escalade est
// impossible (lecture seule, pas de window), le shell rend cette même vue sans
// action : l'aperçu reste utile, il n'est simplement plus cliquable.
export default function RichTextLinkView({ field, value }: FieldViewProps) {
  const preview = firstLine(value);

  return (
    <span className="flex items-center gap-1 min-w-0 text-sm px-0.5 py-0.5">
      <TbFileText size={13} className="shrink-0 text-muted-foreground" />
      {preview ? (
        <span className="truncate">{preview}</span>
      ) : (
        <span className="truncate text-muted-foreground/60 italic">
          {field.name}
        </span>
      )}
    </span>
  );
}
