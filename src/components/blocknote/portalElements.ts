import type { PortalElementsMap } from "@blocknote/react";

/**
 * Où BlockNote monte son UI flottante, pour tous les éditeurs de l'app.
 *
 * Deux familles, deux besoins opposés :
 *
 *   - Les MENUS (barre de formatage, toolbar de lien, slash menu, emoji
 *     picker, side menu, panneau fichier, commentaires) doivent échapper à la
 *     chrome de fenêtre : `WindowFrame` empile un `overflow-hidden` et un
 *     `overflow-auto` autour de l'éditeur, qui les rogneraient à ses bords.
 *     D'où `null` = `document.body`.
 *
 *   - Les POIGNÉES DE TABLE (`tableHandles`) doivent au contraire RESTER dans
 *     l'éditeur. Elles collent au tableau (le « + » d'ajout de colonne fait
 *     toute la hauteur du tableau, à sa droite), et la version portée sur
 *     `body` sortait de la fenêtre : BlockNote leur pose `z-index: 10`, soit
 *     exactement celui du calque des windows (`WindowsContainer`, `z-10`), et
 *     un portal de `body` arrive après `#root` dans l'ordre du DOM — donc au
 *     dessus. Le « + » passait littéralement par dessus la croix de fermeture.
 *     Laissée dans `.bn-container`, la poignée est rognée par le corps de la
 *     fenêtre et ne peut plus déborder sur son en-tête.
 *
 * `default` est volontairement absent : il fixe aussi où `editor.portalElement`
 * est monté, et le forcer sur `document.body` faisait recopier par BlockNote la
 * `className` de l'éditeur (`bn-root`, `nodrag h-full`…) sur `<body>` lui-même.
 * Sans lui, BlockNote retombe sur son `.bn-container`, ce qui est aussi la
 * cible héritée par `tableHandles`.
 *
 * Attention : tout contrôleur monté à la main (SideMenuController,
 * SuggestionMenuController…) hérite lui aussi de `editor.portalElement`, donc
 * de `.bn-container`. Ceux qui doivent flotter hors de la fenêtre passent
 * `portalElement={null}` explicitement.
 */
export const BLOCKNOTE_PORTAL_ELEMENTS: PortalElementsMap = {
  formattingToolbar: null,
  linkToolbar: null,
  slashMenu: null,
  emojiPicker: null,
  sideMenu: null,
  filePanel: null,
  comments: null,
};
