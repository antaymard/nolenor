import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Brouillon d'une cellule en cours d'édition.
 *
 * Les éditeurs texte et rich text gardent la saisie en local jusqu'à la
 * fermeture du popover : publier à chaque frappe ferait sortir la ligne d'un
 * filtre (ou d'une recherche) en pleine saisie, et le popover disparaîtrait
 * avec elle. Mais un `Ctrl+S` sans fermer ne voyait alors rien à sauvegarder,
 * et la saisie était perdue.
 *
 * D'où deux canaux, sans publier la valeur pour autant :
 * - `onDraft` : signale qu'une saisie est en attente, pour que la fenêtre
 *   passe dirty (et que `Ctrl+S` / « Save and close » aient quelque chose à
 *   faire) ;
 * - `registerFlush` : l'éditeur ouvert enregistre de quoi publier son
 *   brouillon SANS se fermer, que la sauvegarde appelle juste avant de lire
 *   les données (cf. `Table.flushEditsRef`).
 */
export type RegisterCellFlush = (flush: () => void) => () => void;

export function useCellDraftFlush(
  registerFlush: RegisterCellFlush | undefined,
  isEditing: boolean,
  flush: () => void,
) {
  // Toujours le dernier `flush` : il lit le brouillon courant, alors que
  // l'enregistrement, lui, ne se refait qu'à l'ouverture.
  const flushRef = useRef(flush);
  useLayoutEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    if (!isEditing || !registerFlush) return;
    return registerFlush(() => flushRef.current());
  }, [isEditing, registerFlush]);
}
