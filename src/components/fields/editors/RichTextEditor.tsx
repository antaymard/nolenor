import { useCallback } from "react";
import type { Value } from "platejs";
import DocumentEditorField from "@/components/fields/document-fields/DocumentEditorField";
import RichTextFullView from "@/components/fields/views/rich_text/FullView";
import { parseRichTextDoc } from "@/components/fields/shared/richTextDoc";
import { useCustomFieldsContext } from "@/components/fields/registry/customFieldsContext";
import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

// Éditeur Plate complet derrière le flux dirty/save du WindowFrame (agrégé
// par CustomWindow via CustomFieldsContext). `commit`/`cancel` restent dans
// la signature pour respecter le contrat FieldEditorProps mais ne sont pas
// utilisés : rich_text est le seul type à commit "deferred" — il ne
// committe jamais directement, il s'enregistre auprès du canal différé
// (généralisé au-delà de rich_text en Phase 5, gardé tel quel ici). Si ce
// canal est absent (éditeur monté hors d'une vraie WindowFrame), on dégrade
// vers un rendu statique — jamais un éditeur qui perdrait son contenu à
// l'unmount.
export default function RichTextEditor({ field, value }: FieldEditorProps) {
  const customFields = useCustomFieldsContext();
  const doc =
    parseRichTextDoc(value) ?? ([{ type: "p", children: [{ text: "" }] }] as Value);

  const handleDocChange = useCallback(
    (nextDoc: Value) => {
      customFields?.reportRichTextDoc(field.id, nextDoc);
    },
    [customFields, field.id],
  );

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      customFields?.reportRichTextDirty(field.id, dirty);
    },
    [customFields, field.id],
  );

  if (!customFields) {
    return <RichTextFullView field={field} value={value} surface="window" />;
  }

  return (
    <div className="min-h-40 rounded-md">
      <DocumentEditorField
        editorId={field.id}
        value={{ doc }}
        visualType="window"
        onDocChange={handleDocChange}
        onDirtyChange={handleDirtyChange}
      />
    </div>
  );
}
