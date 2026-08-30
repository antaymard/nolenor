import { useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import ChatContainer from "@/components/canvas/nole-panel/ChatContainer";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";

/**
 * Nolë en plein écran, aux deux endroits où on la met.
 *
 * Toutes les fenêtres plein écran ouvrent le chat, mais pas de la même façon :
 * celles qui montrent une surface pleine page (table, app, vidéo, image) le
 * posent en surimpression dans un coin, celles qui affichent un document (pdf,
 * blocknote) lui réservent une colonne pour garder le texte centré. Deux
 * dispositions, mais un seul bouton, un seul raccourci et un seul branchement
 * de ChatContainer — au lieu des six copies qu'il a fallu tenir en phase.
 *
 * L'état d'ouverture vit ici : personne d'autre ne le lit, et le remonter
 * obligerait chaque fenêtre à le recâbler. Le raccourci est posé sur
 * `document` par le hook (aucun `target` donné), donc le déclarer ici ou chez
 * l'appelant revient au même.
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
 * Le corps d'une fenêtre plein écran, Nolë par-dessus en bas à gauche.
 *
 * `children` occupe tout l'espace : le chat flotte au-dessus sans lui en
 * prendre, ce qui est le bon compromis quand le contenu est une image, une
 * vidéo ou une grille qu'on veut voir en entier.
 */
export function NoleOverlayBody({ children }: { children: ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  useHotkey("N", () => setIsChatOpen((v) => !v));

  return (
    <main className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="h-full w-full">{children}</div>

      {/* Nolë overlay (bottom-left) */}
      <div className="pointer-events-none absolute bottom-4 left-4">
        <div className="pointer-events-auto relative">
          {isChatOpen && (
            <div className="absolute bottom-10 left-0 w-95 h-[calc(100dvh-8rem)] rounded border bg-white shadow-2xl/10 overflow-hidden [&>div]:shadow-none!">
              <ChatContainer onClose={() => setIsChatOpen(false)} />
            </div>
          )}
          <NoleTrigger onClick={() => setIsChatOpen((v) => !v)} />
        </div>
      </div>
    </main>
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
