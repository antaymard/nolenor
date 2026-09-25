import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * Tient à jour `data-overflow-y` sur une zone défilante de node du canvas
 * (classe `canvas-scroll-area`, cf. index.css).
 *
 * Sur un appareil à souris, ces zones ne défilent qu'au survol de leur node :
 * au repos elles passent en `overflow: hidden`. Un scroller défilable est
 * composé à part par le navigateur, et avec des dizaines de nodes à l'écran
 * ces couches faisaient le gros du coût de chaque frame de pan.
 *
 * Reste le décalage : une scrollbar classique prend de la place, et le
 * contenu se réagencerait (texte rewrappé, colonnes recalculées) chaque fois
 * qu'elle apparaît au survol. D'où ce drapeau : quand le contenu déborde, la
 * gouttière est réservée en permanence (`scrollbar-gutter: stable`), survol ou
 * pas — exactement la largeur qu'occupait la scrollbar toujours visible
 * d'avant. Quand il ne déborde pas, pas de gouttière, comme avant.
 *
 * Mesuré sur la zone et sur ses enfants directs : la zone change de taille
 * quand on redimensionne le node, le contenu quand il est édité, qu'une image
 * finit de charger ou qu'une police arrive.
 *
 * Tient aussi `data-scrolled-y` (défilée vers le bas ou non) : au repos et
 * non défilée, un en-tête `sticky` est exactement à sa place naturelle, et
 * index.css le repasse en `relative` — sans quoi chacun restait une couche
 * composée de plus, pour rien.
 */
export function useCanvasScrollArea(ref: RefObject<HTMLElement | null>) {
  const stateRef = useRef<{
    el: HTMLElement;
    observer: ResizeObserver;
    observed: Set<Element>;
    dispose: () => void;
  } | null>(null);

  // Sans tableau de dépendances : les enfants à observer changent avec le
  // contenu, donc à chaque rendu du node qui l'affiche — et la zone elle-même
  // peut apparaître ou disparaître (état vide ↔ contenu).
  useLayoutEffect(() => {
    const el = ref.current;
    let state = stateRef.current;
    if (state && state.el !== el) {
      state.dispose();
      state = stateRef.current = null;
    }
    if (!el) return;
    if (!state) {
      const observer = new ResizeObserver(() => updateOverflowFlag(el));
      observer.observe(el);
      // Un node hors écran au chargement est mesuré… pendant qu'il est sauté,
      // donc pas du tout (cf. `updateOverflowFlag`). Quand il revient à
      // l'écran, ses tailles peuvent n'avoir pas bougé : l'observer ne
      // repasserait jamais. Le navigateur, lui, annonce le changement d'état
      // du `content-visibility: auto` englobant — un événement qui ne remonte
      // pas, d'où l'écoute en capture sur le node.
      const nodeEl = el.closest(".react-flow__node");
      const onScroll = () => {
        el.toggleAttribute("data-scrolled-y", el.scrollTop > 0);
      };
      onScroll();
      el.addEventListener("scroll", onScroll, { passive: true });
      const onVisibilityChange = (event: Event) => {
        if (!(event as ContentVisibilityAutoStateChangeEvent).skipped) {
          updateOverflowFlag(el);
        }
      };
      nodeEl?.addEventListener(
        "contentvisibilityautostatechange",
        onVisibilityChange,
        { capture: true },
      );
      state = stateRef.current = {
        el,
        observer,
        observed: new Set(),
        dispose: () => {
          observer.disconnect();
          el.removeEventListener("scroll", onScroll);
          nodeEl?.removeEventListener(
            "contentvisibilityautostatechange",
            onVisibilityChange,
            { capture: true },
          );
        },
      };
    }

    const children = new Set(el.children);
    for (const child of state.observed) {
      if (!children.has(child)) {
        state.observer.unobserve(child);
        state.observed.delete(child);
      }
    }
    for (const child of children) {
      if (!state.observed.has(child)) {
        state.observer.observe(child);
        state.observed.add(child);
      }
    }
  });

  useEffect(
    () => () => {
      stateRef.current?.dispose();
      stateRef.current = null;
    },
    [],
  );
}

function updateOverflowFlag(el: HTMLElement) {
  if (!el.isConnected) return;
  // Hors écran, sous un `content-visibility: auto` (NodeFrame) : le layout y
  // est volontairement sauté, et lire `scrollHeight` le forcerait — sur tous
  // les nodes du canvas au chargement. Le drapeau garde sa dernière valeur ;
  // le retour à l'écran relance la mesure (cf. l'écoute de
  // `contentvisibilityautostatechange`).
  if (
    typeof el.checkVisibility === "function" &&
    !el.checkVisibility({ contentVisibilityAuto: true })
  ) {
    return;
  }
  el.toggleAttribute("data-overflow-y", el.scrollHeight > el.clientHeight);
}
