/**
 * L'échelle qui garde un élément à sa taille à l'écran quand on dézoome.
 *
 * `Math.max(1 / zoom, 1)` — copié de `scaleSelector` dans React Flow, qui
 * l'applique à ses poignées de resize : l'élément grossit à mesure qu'on
 * s'éloigne, donc reste lisible, mais ne rétrécit jamais sous sa taille CSS
 * quand on zoome dedans.
 *
 * Une seule règle pour tout ce qui « reste lisible » sur le canvas : le titre
 * des frames, et les nodes qui activent l'option d'affichage `scaleWithZoom`.
 * Sélecteur `useStore` : il rend un nombre, comparé en `Object.is`, donc un
 * pan sans changement de zoom ne re-rend rien.
 */
export const zoomCompensationScaleSelector = (state: {
  transform: [number, number, number];
}) => Math.max(1 / state.transform[2], 1);
