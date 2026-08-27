import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Rend une iframe inerte tant que l'utilisateur ne l'a pas activée.
 *
 * Une iframe vive avale tous les événements pointeur et molette : au-dessus
 * d'elle, ctrl/⌘ + molette et pinch trackpad déclenchent le zoom du navigateur
 * au lieu de celui du canvas. Et comme un `wheel` né dans un document
 * cross-origin n'atteint jamais le nôtre, aucun bouclier *réactif* ne peut
 * marcher : il faut que l'iframe soit déjà neutralisée quand le geste commence.
 *
 * D'où l'activation explicite : tant que le bouclier est en place, molette,
 * pinch, sélection et drag tombent sur notre propre DOM et remontent
 * normalement à React Flow. Un clic rend la main à l'iframe ; sortir du node,
 * le désélectionner, le déplacer ou Escape la reprennent.
 *
 * Le déverrouillage est volontairement étroit — le pointeur doit rester dans le
 * node — parce qu'une iframe vive est un trou : au-dessus d'un document tiers,
 * le geste de zoom échappe de nouveau au canvas. Les AppNode, dont on possède
 * le srcdoc, sont armés de l'intérieur et n'ont pas ce trou.
 *
 * Le bouclier filtre l'*entrée*, pas l'exécution : l'iframe reste montée et son
 * JS continue de tourner (une vidéo verrouillée continue de jouer).
 *
 * Réutilisable pour n'importe quelle iframe posée sur le canvas — il suffit de
 * lui passer l'état de sélection du node qui la porte.
 */

/** Déplacement au-delà duquel un « clic » est en fait la fin d'un drag. */
const CLICK_SLOP_PX = 4;

/**
 * Couvre l'intervalle de double-clic. Sans ce délai, le bouclier disparaîtrait
 * entre les deux clics : le second tomberait dans l'iframe, `dblclick` n'aurait
 * plus de cible commune, et `NodeFrame` n'ouvrirait plus jamais la fenêtre d'un
 * node déjà sélectionné. La pastille d'activation court-circuite l'attente.
 */
const UNLOCK_DELAY_MS = 300;

type PressOrigin = { x: number; y: number };

export default function IframeInteractionGate({
  isNodeSelected,
  isNodeDragging = false,
  label = "Click to interact",
  className,
  children,
}: {
  /** `xyNode.selected` du node porteur. */
  isNodeSelected: boolean;
  /** `xyNode.dragging` du node porteur : un drag reprend la main à l'iframe. */
  isNodeDragging?: boolean;
  /** Texte de la pastille d'activation. `null` pour n'en afficher aucune. */
  label?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const pressRef = useRef<PressOrigin | null>(null);
  const unlockTimerRef = useRef<number | null>(null);

  const cancelPendingUnlock = useCallback(() => {
    if (unlockTimerRef.current === null) return;
    clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = null;
  }, []);

  // Dérivé plutôt que synchronisé par effet : le bouclier revient dans le même
  // render que la désélection, sans frame où l'iframe serait à découvert.
  const isActive = isUnlocked && isNodeSelected && !isNodeDragging;

  // Le verrou ne doit pas survivre à ce qui l'a fermé, sinon re-sélectionner le
  // node rouvrirait l'iframe sans que l'utilisateur l'ait demandé.
  // Un drag reverrouille donc définitivement : déplacer un node coûte son
  // activation, ce qui est le comportement voulu (et vaut aussi pour les autres
  // nodes sélectionnés, `dragging` étant vrai sur toute la sélection).
  useEffect(() => {
    if (!isNodeSelected || isNodeDragging) {
      cancelPendingUnlock();
      setIsUnlocked(false);
    }
  }, [isNodeSelected, isNodeDragging, cancelPendingUnlock]);

  useEffect(() => cancelPendingUnlock, [cancelPendingUnlock]);

  // Best-effort : une fois le clic passé *dans* l'iframe, le focus y est et le
  // `keydown` ne remonte plus jusqu'ici. La désélection reste le chemin fiable.
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsUnlocked(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      pressRef.current = { x: event.clientX, y: event.clientY };
    },
    [],
  );

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      const press = pressRef.current;
      pressRef.current = null;

      if (!press) return;

      // Fin de drag : le pointeur a bougé, ce n'est pas une intention de clic.
      if (
        Math.abs(event.clientX - press.x) > CLICK_SLOP_PX ||
        Math.abs(event.clientY - press.y) > CLICK_SLOP_PX
      ) {
        return;
      }

      cancelPendingUnlock();
      unlockTimerRef.current = window.setTimeout(
        () => setIsUnlocked(true),
        UNLOCK_DELAY_MS,
      );
    },
    [cancelPendingUnlock],
  );

  // Le pointeur qui quitte le node reverrouille : c'est ce qui garde le geste de
  // zoom au canvas partout ailleurs. `mouseleave` ne se déclenche pas en entrant
  // dans l'iframe, qui est un descendant — seulement en sortant pour de bon.
  const handleMouseLeave = useCallback(() => {
    cancelPendingUnlock();
    setIsUnlocked(false);
  }, [cancelPendingUnlock]);

  const handleUnlockNow = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      cancelPendingUnlock();
      setIsUnlocked(true);
    },
    [cancelPendingUnlock],
  );

  return (
    <div
      className={cn(
        "relative",
        // L'iframe est vive : on le dit, sans bleu pour ne pas imiter la sélection.
        isActive && "ring-1 ring-inset ring-emerald-400/70",
        className,
      )}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {!isActive && (
        // Ni `nowheel` ni `nodrag` : on veut justement que React Flow reçoive
        // la molette et le drag qui tombent ici. Pas de `z-` non plus — un
        // élément positionné passe déjà devant son frère `<iframe>` statique,
        // et rester hors du jeu des z-index laisse l'overlay de NodeFrame
        // au-dessus pendant les resize.
        <div
          className="group/gate absolute inset-0 cursor-pointer"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          // Laisse remonter jusqu'à `NodeFrame`, qui ouvre la fenêtre.
          onDoubleClick={cancelPendingUnlock}
        >
          {label && (
            <button
              type="button"
              className="absolute bottom-2 right-2 select-none rounded bg-slate-900/75 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity duration-150 group-hover/gate:opacity-100 focus-visible:opacity-100"
              // Ne doit ni démarrer un drag de node ni ouvrir la fenêtre.
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onClick={handleUnlockNow}
            >
              {label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
