import { createContext, useContext } from "react";
import type { Value } from "platejs";

// Canal entre CustomWindow et ses champs rich_text profondément imbriqués
// dans LayoutRenderer : les éditeurs Plate ne committent pas au blur, ils
// s'enregistrent ici et CustomWindow agrège dirty/save vers le
// WindowFrameContext (Mod+S / bouton Save), comme DocumentWindow.

interface CustomFieldsContextValue {
  reportRichTextDoc: (fieldId: string, doc: Value) => void;
  reportRichTextDirty: (fieldId: string, dirty: boolean) => void;
}

const CustomFieldsContext = createContext<CustomFieldsContextValue | null>(
  null,
);

export function useCustomFieldsContext() {
  return useContext(CustomFieldsContext);
}

export { CustomFieldsContext };
export type { CustomFieldsContextValue };
