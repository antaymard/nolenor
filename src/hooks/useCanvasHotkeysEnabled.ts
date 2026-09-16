import { useCanvasStore } from "@/stores/canvasStore";
import { useCommandCenterStore } from "@/stores/commandCenterStore";

/**
 * La condition qui autorise un raccourci clavier NU du canvas (une lettre sans
 * modificateur : T, B, F…).
 *
 * Partagée plutôt que recopiée : deux des quatre termes ne se devinent pas, et
 * une copie divergerait à la première correction.
 *
 * - `focus === "canvas"` est un test POSITIF, comme l'impose le commentaire de
 *   `canvasStore` : toute nouvelle valeur de `focus` doit désactiver les
 *   raccourcis du canvas plutôt que les laisser passer par défaut.
 * - Les deux modales sont exclues explicitement parce que l'`ignoreInputs` de
 *   la lib ne couvre pas le cas où le focus a quitté l'input tout en restant
 *   dans la modale.
 *
 * S'utilise avec, à chaque binding, `ignoreInputs: true` et un `event.repeat`
 * ignoré — la lib rejoue les bindings à l'auto-répétition.
 */
export function useCanvasHotkeysEnabled({
  canEdit,
  isTouch,
}: {
  canEdit: boolean;
  isTouch: boolean;
}): boolean {
  const focus = useCanvasStore((state) => state.focus);
  const isSearchModalOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const isCommandCenterOpen = useCommandCenterStore((state) => state.isOpen);

  return (
    canEdit &&
    !isTouch &&
    focus === "canvas" &&
    !isSearchModalOpen &&
    !isCommandCenterOpen
  );
}
