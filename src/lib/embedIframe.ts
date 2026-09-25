/**
 * Sandbox des iframes de la variante `embed` d'un node `link` (node et
 * window).
 *
 * `allow-same-origin` n'est sûr ici que parce que le `src` est toujours une
 * URL tierce : l'iframe garde l'origine du site embarqué et n'a aucun accès à
 * Nolënor. Il ne doit JAMAIS être posé sur un contenu `srcdoc` ou `blob:` —
 * c'est pourquoi AppNode et AppWindow restent en `allow-scripts` seul.
 *
 * Les autres drapeaux reprennent ce dont les éditeurs Google et Microsoft ont
 * besoin : téléchargements et boîtes de dialogue (export, impression), popups
 * libérées du sandbox (connexion, « ouvrir dans un onglet »), et la Storage
 * Access API, qui permet au site de demander ses cookies au clic de
 * l'utilisateur.
 */
export const LINK_EMBED_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-presentation",
  "allow-downloads",
  "allow-modals",
  "allow-storage-access-by-user-activation",
].join(" ");
