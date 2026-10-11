import { useEffect } from "react";
import { TbEye } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { useSettingsModalStore } from "@/stores/settingsModalStore";

/**
 * Maintenir pour voir le canvas : la modale s'estompe tant que le bouton est
 * enfoncé (souris, doigt, ou Espace / Entrée au clavier), avec le fond en
 * cours de réglage appliqué.
 */
export default function CanvasPeekButton() {
  const setPeeking = useSettingsModalStore((state) => state.setPeeking);
  useEffect(() => () => setPeeking(false), [setPeeking]);

  return (
    <Button
      type="button"
      variant="outline"
      className="touch-none select-none"
      onPointerDown={(event) => {
        // Le relâchement arrive ici même si le pointeur a quitté le bouton.
        event.currentTarget.setPointerCapture(event.pointerId);
        setPeeking(true);
      }}
      onPointerUp={() => setPeeking(false)}
      onPointerCancel={() => setPeeking(false)}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          setPeeking(true);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") setPeeking(false);
      }}
      onBlur={() => setPeeking(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <TbEye />
      Hold to preview
    </Button>
  );
}
