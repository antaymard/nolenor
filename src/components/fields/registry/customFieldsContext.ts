import { createContext, useContext } from "react";

// Canal différé entre CustomWindow et ses champs profondément imbriqués dans
// LayoutRenderer. Les variants dont la politique de commit est "deferred"
// (aujourd'hui rich_text.full) ne committent pas au blur : ils publient leur
// valeur en attente ici, et CustomWindow agrège dirty/save vers le
// WindowFrameContext (Mod+S / bouton Save), comme BlocknoteWindow.
//
// Générique (et non plus rich_text/Plate-spécifique) : `reportPendingValue`
// reçoit la valeur DÉJÀ sous sa forme stockée, donc CustomWindow n'a plus à
// connaître le type des champs qu'il sauvegarde.
//
// Le défaut `null` est un garde-fou volontaire, à ne pas remplacer par un
// objet no-op : il permet à un éditeur différé monté hors d'une vraie
// WindowFrame (preview du builder, node canvas) de le détecter et de dégrader
// en rendu statique, au lieu d'écrire dans le vide et de perdre le contenu de
// l'utilisateur à l'unmount. WindowFrameContext, lui, a un défaut no-op
// silencieux — raison de plus pour ne pas router ce canal à travers lui.

interface CustomFieldsContextValue {
  reportPendingValue: (fieldId: string, storedValue: unknown) => void;
  reportDirty: (fieldId: string, dirty: boolean) => void;
}

const CustomFieldsContext = createContext<CustomFieldsContextValue | null>(
  null,
);

export function useCustomFieldsContext() {
  return useContext(CustomFieldsContext);
}

export { CustomFieldsContext };
export type { CustomFieldsContextValue };
