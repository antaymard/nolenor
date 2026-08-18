import { memo, useCallback, useState } from "react";
import { BlockNoteEditor, filterSuggestionItems } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  getDefaultReactSlashMenuItems,
  SideMenuController,
  SuggestionMenuController,
} from "@blocknote/react";
import { markdownToBlockNoteBlocks } from "@/lib/blockNoteMarkdownConverter";
import { SideMenuWithoutAddButton } from "@/components/blocknote/SideMenu";
import { BlockNoteErrorBoundary } from "@/components/blocknote/BlockNoteErrorBoundary";

// Éditeur du corps d'une skill.
//
// Contrairement aux éditeurs du canvas, celui-ci tourne sur le SCHÉMA PAR
// DÉFAUT de BlockNote : pas de callout, pas de pilule de date, pas de mention
// de node. Le corps d'une skill est un prompt Markdown envoyé au LLM — un type
// de bloc custom n'y a aucune traduction, et une mention de node n'a aucun sens
// hors d'un canvas.
//
// Le Markdown reste le format de stockage (`skills.content`, frontmatter
// compris) : on parse à l'ouverture, on resérialise à chaque édition. La
// conversion est lossy par nature, comme partout ailleurs dans l'app — ce qui
// ne s'exprime pas en Markdown (couleurs, alignement) n'est pas conservé.
//
// Le composant n'est pas contrôlé : `initialMarkdown` n'est lu qu'au montage.
// L'appelant le remonte (via `key`) quand il change de skill.

// Monte les menus flottants de BlockNote sur document.body plutôt que dans
// .bn-container par défaut, pour éviter qu'ils soient clippés par un ancêtre
// overflow:hidden/auto — même réglage que les autres éditeurs de l'app.
const PORTAL_ELEMENTS = { default: null } as const;

type SkillContentEditorProps = {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
};

function SkillContentEditor({
  initialMarkdown,
  onChange,
}: SkillContentEditorProps) {
  // `markdownToBlockNoteBlocks` passe par le convertisseur de l'app (schéma
  // étendu), mais le Markdown ne peut produire que des blocs par défaut : le
  // résultat est donc valide pour l'éditeur par défaut construit ici.
  const [editor] = useState(() => {
    const blocks = markdownToBlockNoteBlocks(initialMarkdown);
    return BlockNoteEditor.create({
      initialContent: blocks.length > 0 ? blocks : undefined,
    });
  });

  const handleChange = useCallback(() => {
    onChange(editor.blocksToMarkdownLossy(editor.document).trim());
  }, [editor, onChange]);

  return (
    <BlockNoteErrorBoundary resetKey={initialMarkdown}>
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={handleChange}
        slashMenu={false}
        sideMenu={false}
        portalElements={PORTAL_ELEMENTS}
      >
        {/* No `portalElement` override: it would bypass `editor.portalElement`
            and break the drag handle's hover tracking — see the long version
            in BlocknoteWindow.tsx next to the same controller. */}
        <SideMenuController sideMenu={SideMenuWithoutAddButton} />
        <SuggestionMenuController
          triggerCharacter="/"
          portalElement={null}
          shouldOpen={(tr) =>
            !tr.selection.$from.parent.type.isInGroup("tableContent")
          }
          getItems={async (query) =>
            filterSuggestionItems(getDefaultReactSlashMenuItems(editor), query)
          }
        />
      </BlockNoteView>
    </BlockNoteErrorBoundary>
  );
}

export default memo(SkillContentEditor);
