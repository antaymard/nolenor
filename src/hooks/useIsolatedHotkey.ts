import { useHotkey, type LetterKey } from "@tanstack/react-hotkeys";
import { runIfIsolatedKeystroke } from "@/lib/isolatedKeystroke";

/**
 * Un raccourci NU (une lettre sans modificateur) qui ne part que sur une
 * frappe isolée — cf. `runIfIsolatedKeystroke`. Taper un mot contenant la
 * lettre alors que le focus n'est dans aucun champ ne le déclenche pas.
 *
 * L'action part ~200 ms après la touche ; elle doit lire l'état courant (store,
 * setter fonctionnel) plutôt qu'une valeur capturée au rendu.
 */
export function useIsolatedHotkey(
  hotkey: LetterKey,
  action: () => void,
  { enabled = true }: { enabled?: boolean } = {},
) {
  useHotkey(
    hotkey,
    (event) => {
      // Une touche maintenue rejouerait le binding (`requireReset` est faux
      // par défaut).
      if (event.repeat) return;
      runIfIsolatedKeystroke(event, action);
    },
    // Explicite : une frappe dans un champ ne doit jamais atteindre l'action.
    { enabled, ignoreInputs: true },
  );
}
