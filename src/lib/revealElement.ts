/**
 * Amène un élément au centre de sa zone de défilement et le surligne
 * brièvement, pour qu'on le repère en arrivant (résultat de recherche du
 * panel latéral).
 */
export function revealElement(element: HTMLElement): void {
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.animate(
    [
      // yellow-400 translucide : lisible sur fond clair comme sombre.
      { backgroundColor: "rgb(250 204 21 / 0.35)" },
      { backgroundColor: "transparent" },
    ],
    { duration: 1500, easing: "ease-out" },
  );
}
