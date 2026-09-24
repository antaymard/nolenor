import { useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import ChatContainer from "@/components/canvas/nole-panel/ChatContainer";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";

/**
 * Nolë dans une fenêtre plein écran, aux deux endroits où on la met.
 *
 * Les fenêtres qui montrent une surface pleine page (table, app, vidéo,
 * image…) la posent en surimpression dans un coin, celles qui affichent un
 * document (pdf, blocknote) lui réservent une colonne pour garder le texte
 * centré. Deux dispositions, mais un seul bouton, un seul raccourci et un seul
 * branchement de ChatContainer.
 *
 * Les deux sont des *voisins* du body dans `WindowFrame`, jamais des
 * enveloppes : le body doit garder sa place dans l'arbre React quand la
 * fenêtre entre ou sort du plein écran, sinon il est démonté (lecture vidéo,
 * scroll, brouillon non sauvegardé perdus).
 *
 * L'état d'ouverture vit ici : personne d'autre ne le lit. Le raccourci est
 * posé sur `document` par le hook (aucun `target` donné).
 */

/** L'appel à Nolë, identique dans les deux dispositions. */
function NoleTrigger({ onClick }: { onClick: () => void }) {
  return (
    <div className="canvas-ui-container px-0!">
      <Button variant="ghost" onClick={onClick}>
        <NoleIcon /> Nolë
        <Kbd>N</Kbd>
      </Button>
    </div>
  );
}

/**
 * Nolë en surimpression, en bas à gauche du contenu.
 *
 * À poser dans un parent `relative` : le contenu garde tout l'espace et le
 * chat flotte au-dessus, le bon compromis quand on veut voir en entier une
 * image, une vidéo ou une grille.
 */
export function NoleOverlay() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  useHotkey("N", () => setIsChatOpen((v) => !v));

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10">
      <div className="pointer-events-auto relative">
        {isChatOpen && (
          <div className="absolute bottom-10 left-0 w-95 h-[calc(100dvh-8rem)] rounded border bg-white shadow-2xl/10 overflow-hidden [&>div]:shadow-none!">
            <ChatContainer onClose={() => setIsChatOpen(false)} />
          </div>
        )}
        <NoleTrigger onClick={() => setIsChatOpen((v) => !v)} />
      </div>
    </div>
  );
}

/**
 * La colonne Nolë des fenêtres de lecture.
 *
 * Sa largeur est réservée en permanence — fermée, elle ne montre que le
 * bouton — pour que le document ne se décale pas quand on ouvre le chat.
 */
export function NoleAside() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  useHotkey("N", () => setIsChatOpen((v) => !v));

  return (
    <aside className="relative flex w-95 shrink-0 flex-col border-r bg-white [&>div]:shadow-none!">
      {isChatOpen ? (
        <ChatContainer onClose={() => setIsChatOpen(false)} />
      ) : (
        <div className="absolute bottom-4 left-4">
          <NoleTrigger onClick={() => setIsChatOpen(true)} />
        </div>
      )}
    </aside>
  );
}
