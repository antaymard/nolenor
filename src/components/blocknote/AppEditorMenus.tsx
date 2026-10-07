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
 * à rendre en enfants de `BlockNoteView` avec `slashMenu={false}` et
 * `sideMenu={false}`. Mêmes réglages que BlocknoteWindow, qui en documente
 * les raisons (portails, keys du menu de mention).
 */
export function AppEditorMenus({ editor }: { editor: AppBlockNoteEditor }) {
  return (
    <>
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
      <SuggestionMenuController<(query: string) => Promise<NodeMentionItem[]>>
        triggerCharacter="@"
        suggestionMenuComponent={NodeMentionMenu}
        getItems={async (query) => getNodeMentionSuggestionItems(editor, query)}
      />
    </>
  );
}
