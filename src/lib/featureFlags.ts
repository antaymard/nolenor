import { redirect } from "@tanstack/react-router";

/**
 * Chantiers encore ouverts : le code reste dans le bundle et continue d'être
 * typé, lint et compilé — seule la porte d'entrée disparaît en production.
 *
 * `import.meta.env.DEV` est vrai sous `vite dev` et faux dès qu'on passe par
 * `vite build`, preview comprise. On développe donc la fonctionnalité
 * normalement en local, sans la proposer aux utilisateurs.
 *
 * Concerne aujourd'hui les pages Recipes et Custom nodes des settings. Les
 * custom nodes DÉJÀ posés sur un canvas restent, eux, pleinement utilisables
 * et éditables (clic droit → éditer le template) : c'est la découverte et la
 * création depuis les settings qui sont mises de côté, pas le rendu.
 */
export const SHOW_DEV_ONLY_SETTINGS = import.meta.env.DEV;

/**
 * Garde `beforeLoad` pour les routes concernées : en production, l'URL saisie
 * à la main renvoie sur Account plutôt que d'afficher une page qui n'a plus
 * d'entrée dans la sidebar.
 */
export function guardDevOnlySettingsRoute(): void {
  if (!SHOW_DEV_ONLY_SETTINGS) {
    throw redirect({ to: "/settings/account" });
  }
}
