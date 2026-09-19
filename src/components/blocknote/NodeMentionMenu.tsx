import { mergeCSSClasses } from "@blocknote/core";
import {
  useComponentsContext,
  useDictionary,
  type SuggestionMenuProps,
} from "@blocknote/react";
import { useMemo, type JSX } from "react";

import type { NodeMentionItem } from "./nodeMentionSuggestions";

/**
 * Le menu du `@`, identique à celui de `@blocknote/react` à UNE ligne près :
 * la clé React d'une ligne.
 *
 * Le menu par défaut keye sur `item.title` (`SuggestionMenu.tsx`, @blocknote/react
 * 0.41). Son type d'item n'a pas d'id, donc c'est tout ce qu'il a sous la main —
 * mais deux nodes peuvent parfaitement porter le même titre : `getNodeDataTitle`
 * rend « Frame » pour TOUTE frame sans nom, « Blocknote » pour tout document qui
 * ne commence pas par un titre, le nom du template pour toute instance anonyme
 * d'un custom node. Deux enfants de même clé, et React réconcilie de travers :
 * `isSelected` est calculé par index mais atterrit sur la mauvaise ligne, si
 * bien que la flèche bas saute le bloc de lignes jumelles au lieu de le
 * parcourir. On keye donc sur le `nodeDataId`, unique par construction.
 *
 * Le composant par défaut n'est pas exporté (il ne figure pas dans le barrel de
 * `@blocknote/react`), d'où la recopie plutôt qu'un enrobage. Tout le reste
 * vient du contexte de composants : le style shadcn, le chargement, l'état vide
 * et le `scrollIntoView` de la ligne sélectionnée — ce dernier s'appuie sur
 * `isSelected` et sur son propre ref, pas sur l'`id`, qui ne sert qu'à
 * l'`aria-activedescendant` posé par le wrapper. À relire à la prochaine montée
 * de version de `@blocknote/react` : c'est un jumeau, il peut diverger.
 */
export function NodeMentionMenu(props: SuggestionMenuProps<NodeMentionItem>) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();

  const { items, loadingState, selectedIndex, onItemClick } = props;

  const loader =
    loadingState === "loading-initial" || loadingState === "loading" ? (
      <Components.SuggestionMenu.Loader className="bn-suggestion-menu-loader" />
    ) : null;

  const renderedItems = useMemo<JSX.Element[]>(
    () =>
      items.map((item, index) => (
        <Components.SuggestionMenu.Item
          key={item.nodeDataId}
          className={mergeCSSClasses(
            "bn-suggestion-menu-item",
            item.size === "small" ? "bn-suggestion-menu-item-small" : "",
          )}
          item={item}
          id={`bn-suggestion-menu-item-${index}`}
          isSelected={index === selectedIndex}
          onClick={() => onItemClick?.(item)}
        />
      )),
    [Components, items, onItemClick, selectedIndex],
  );

  return (
    <Components.SuggestionMenu.Root
      id="bn-suggestion-menu"
      className="bn-suggestion-menu"
    >
      {renderedItems}
      {renderedItems.length === 0 &&
        (loadingState === "loading" || loadingState === "loaded") && (
          <Components.SuggestionMenu.EmptyItem className="bn-suggestion-menu-item">
            {dict.suggestion_menu.no_items_title}
          </Components.SuggestionMenu.EmptyItem>
        )}
      {loader}
    </Components.SuggestionMenu.Root>
  );
}
