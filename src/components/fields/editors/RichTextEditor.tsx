import { useCallback } from "react";
import type { Block } from "@blocknote/core";
import BlockNoteFieldEditor from "@/components/blocknote/BlockNoteFieldEditor";
import RichTextFullView from "@/components/fields/views/rich_text/FullView";
import { stringifyBlockNoteDocumentForStorage } from "@/../convex/lib/blockNoteDocument";
import { useCustomFieldsContext } from "@/components/fields/registry/customFieldsContext";
import type { FieldEditorProps } from "@/components/fields/fieldHostTypes";

// Éditeur BlockNote de champ, derrière le flux dirty/save du WindowFrame
// (agrégé par CustomWindow via CustomFieldsContext). `commit`/`cancel` font
// partie du contrat FieldEditorProps mais ne sont pas utilisés : rich_text est
// le seul type à commit "deferred" — il ne committe jamais directement, il
// publie sa valeur en attente dans le canal différé.
//
// Si ce canal est absent (éditeur monté hors d'une vraie WindowFrame : preview
// du builder, node canvas), on dégrade vers le rendu statique — jamais un
// éditeur qui perdrait silencieusement son contenu à l'unmount.
export default function RichTextEditor({
  field,
  value,
  showLabel,
}: FieldEditorProps) {
  const customFields = useCustomFieldsContext();

  const handleDocChange = useCallback(
    (doc: Block[]) => {
      if (!customFields) return;
      // Sérialisé ICI, pas au call-site du save : CustomWindow n'a ainsi
      // jamais à connaître le type des champs qu'il sauvegarde. Un document
      // structurellement invalide n'est pas publié — le serveur le rejetterait
      // de toute façon, autant ne pas marquer la window dirty pour rien.
      try {
        customFields.reportPendingValue(
          field.id,
          stringifyBlockNoteDocumentForStorage(doc),
        );
      } catch (error) {
        console.error("[RichTextEditor] invalid document, not published:", error);
      }
    },
    [customFields, field.id],
  );

  const handleDirtyChange = useCallback(
    (dirty: boolean) => {
      customFields?.reportDirty(field.id, dirty);
    },
    [customFields, field.id],
  );

  if (!customFields) {
    return (
      <RichTextFullView
        field={field}
        value={value}
        surface="window"
        showLabel={showLabel}
      />
    );
  }

  return (
    <BlockNoteFieldEditor
      value={value}
      onDocChange={handleDocChange}
      onDirtyChange={handleDirtyChange}
      className="min-h-40 rounded-md"
    />
  );
}
