import { useCallback } from "react";
import { normalizeNodeId, type Value } from "platejs";
import DocumentStaticField from "@/components/fields/document-fields/DocumentStaticField";
import DocumentEditorField from "@/components/fields/document-fields/DocumentEditorField";
import { parseStoredPlateDocument } from "@/../convex/lib/plateDocumentStorage";
import { useCustomFieldsContext } from "@/components/fields/registry/customFieldsContext";
import type { FieldRenderProps } from "@/components/fields/registry/fieldRegistry";

// La value stockée est du Plate JSON stringifié (même convention que les
// nodes document).

function parseDoc(value: unknown): Value | null {
  const parsed = parseStoredPlateDocument(value);
  if (!parsed || parsed.length === 0) return null;
  return normalizeNodeId(parsed as Value);
}

// Node canvas : rendu statique virtualisé, jamais d'éditeur Plate monté
// dans un node (cf. plan — l'édition passe par la window).
export function RichTextNodeDisplay({ field, value }: FieldRenderProps) {
  const doc = parseDoc(value);

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

// Window : éditeur Plate complet derrière le flux dirty/save du
// WindowFrame (agrégé par CustomWindow via CustomFieldsContext). En
// lecture seule (viewer, preview builder) : rendu statique.
export function RichTextWindowEditor({
  field,
  value,
  onCommit,
}: FieldRenderProps) {
  const customFields = useCustomFieldsContext();
  const doc = parseDoc(value) ?? ([{ type: "p", children: [{ text: "" }] }] as Value);

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

  if (!onCommit || !customFields) {
    const staticDoc = parseDoc(value);
    if (!staticDoc) {
      return (
        <span className="block text-sm text-muted-foreground/60 italic px-0.5">
          {field.name}
        </span>
      );
    }
    return <DocumentStaticField value={{ doc: staticDoc }} preview />;
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
