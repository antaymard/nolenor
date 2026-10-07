import { filterSuggestionItems } from "@blocknote/core";
import {
  getDefaultReactSlashMenuItems,
  SideMenuController,
  SuggestionMenuController,
} from "@blocknote/react";
import type { AppBlockNoteEditor } from "./schema";
import { getCustomSlashMenuItems, groupSuggestionItems } from "./registry";
import {
  getNodeMentionSuggestionItems,
  type NodeMentionItem,
} from "./nodeMentionSuggestions";
import { NodeMentionMenu } from "./NodeMentionMenu";
import { SideMenuWithoutAddButton } from "./SideMenu";

/**
 * Les menus flottants d'un éditeur BlockNote de l'app (side menu, `/`, `@`),
 * à rendre en enfants de `BlockNoteView` avec `slashMenu={false}`,
 * `sideMenu={false}` et `portalElements={{ default: null }}` (menus montés sur
 * document.body plutôt que dans la chrome overflow:hidden des windows, qui
 * les rognait).
 */
export function AppEditorMenus({ editor }: { editor: AppBlockNoteEditor }) {
  return (
    <>
      {/* No `portalElement` override here: BlockNote's own mousemove
          hide-tracking (SideMenuView.onMouseMove -> editor.isWithinEditor)
          only recognizes elements inside `editor.portalElement`. Forcing
          this popover straight into `document.body` (as the neighbouring
          SuggestionMenuController does) puts the drag handle outside that
          check, so the instant the cursor reaches the handle the menu
          reads it as "left the editor" and hides it. Leaving this prop
          unset falls back to `editor.portalElement`, which is already
          mounted at document.body via `portalElements` on the view — same
          clipping fix, without breaking hover tracking. */}
      <SideMenuController sideMenu={SideMenuWithoutAddButton} />
      <SuggestionMenuController
        triggerCharacter="/"
        portalElement={null}
        shouldOpen={(tr) =>
          !tr.selection.$from.parent.type.isInGroup("tableContent")
        }
        getItems={async (query) =>
          filterSuggestionItems(
            groupSuggestionItems([
              ...getDefaultReactSlashMenuItems(editor),
              ...getCustomSlashMenuItems(editor),
            ]),
            query,
          )
        }
      />
      {/* `suggestionMenuComponent` : le menu par défaut keye ses lignes
          sur le titre, et deux nodes peuvent porter le même (cf.
          `NodeMentionMenu`).

          Le type d'item est passé explicitement : les props du contrôleur
          sont un type conditionnel SUR ce générique, ce qui bloque son
          inférence depuis `getItems` — sans ça TypeScript retombe sur le
          défaut `DefaultReactSuggestionItem` et refuse notre menu. */}
      <SuggestionMenuController<(query: string) => Promise<NodeMentionItem[]>>
        triggerCharacter="@"
        suggestionMenuComponent={NodeMentionMenu}
        getItems={async (query) => getNodeMentionSuggestionItems(editor, query)}
      />
    </>
  );
}
