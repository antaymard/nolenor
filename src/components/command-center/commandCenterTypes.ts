import type { IconType } from "react-icons";

/**
 * Une entrée exécutable du command center.
 *
 * Le command center est pensé pour grossir : chaque nouvelle fonctionnalité
 * (créer un canvas, ouvrir les settings, lancer un slideshow…) se contente
 * d'ajouter des `CommandItem` dans `useCommandCenterItems`, l'UI et la
 * navigation clavier n'ont pas à changer.
 */
export type CommandItem = {
  /** Identifiant stable, unique parmi toutes les commandes. */
  id: string;
  /** Libellé affiché et cible du filtrage flou. */
  label: string;
  /** Section sous laquelle la commande est regroupée dans la liste. */
  group: string;
  /** Texte discret affiché à droite (badge, contexte…). */
  hint?: string;
  /** Termes supplémentaires pris en compte par le filtrage, non affichés. */
  keywords?: string[];
  icon?: IconType;
  /** Exécutée à l'Enter / au clic. La fermeture de la modale est automatique. */
  run: () => void;
};

/** Une commande retenue par le filtre, avec de quoi surligner le libellé. */
export type MatchedCommandItem = CommandItem & {
  /** Index (dans `label`) des caractères ayant matché la requête. */
  matchedIndices: number[];
};
