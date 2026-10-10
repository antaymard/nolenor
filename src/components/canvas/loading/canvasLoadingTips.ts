/**
 * Les astuces de l'écran de chargement du canvas : des gestes qui existent
 * mais ne se voient pas dans l'interface. Chacune doit rester vraie — elles
 * recopient le manuel (`convex/systemSkills/manual-shortcuts` et voisins),
 * à tenir à jour avec lui.
 *
 * Une touche s'écrit entre crochets (`[Shift]`), rendue en `<kbd>`. `[Mod]`
 * et `[Alt]` prennent le libellé de la plateforme (⌘ / ⌥ sur Mac).
 */
export const CANVAS_LOADING_TIPS: readonly string[] = [
  "[Alt]-click a block to attach it to Nolë as context.",
  "[Alt]-click empty canvas to point Nolë at that spot.",
  "Hold [Shift] while dragging to snap to alignment guides.",
  "Hold [Mod] while dragging a block to carry along the blocks it points to.",
  "Right-click a block → Appearance to switch its variant.",
  "Short on room? Right-click a frame → Appearance → Compact to fold it into a card.",
  "Click a mention or a search result to go to the block. [Mod]-click opens its window.",
  "Right-click a title → Appearance → Scale with zoom keeps it readable from afar.",
  "Hold [Mod] during a lasso to select blocks but skip frames.",
  "Right-click a selection to align, distribute or tidy it up.",
  "Release a connection on empty canvas to create a block already linked to it.",
  "Press [T] [D] [I] [A] or [L] over the canvas to drop a block at the pointer.",
  "[Mod] [K] searches the whole canvas, PDF text and transcripts included.",
  "[Mod] [P] jumps to another canvas or to a bookmark.",
  "Right-click empty canvas → Bookmark here saves a spot. [B] lists your bookmarks.",
  "Press [F] to draw a frame around blocks.",
  "Hold [Space] and drag to pan with the left button.",
  "Double-click a connection to edit its label.",
  "Drag a window's header to a screen edge to snap it to a third of the screen.",
  "Hold [Ctrl] [Alt] in Nolë's chat to dictate, release to stop.",
];

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform);

const KEY_LABELS: Record<string, string> = IS_MAC
  ? { Mod: "⌘", Alt: "⌥" }
  : { Mod: "Ctrl" };

export type TipPart = { text: string; isKey: boolean };

/** Découpe une astuce en texte et touches, libellés de plateforme résolus. */
export function parseTip(tip: string): TipPart[] {
  return tip
    .split(/\[([^\]]+)\]/)
    .map((text, index) =>
      index % 2 === 1
        ? { text: KEY_LABELS[text] ?? text, isKey: true }
        : { text, isKey: false },
    )
    .filter((part) => part.text !== "");
}

let lastTipIndex = -1;

/** Une astuce au hasard, jamais la même deux chargements de suite. */
export function pickCanvasLoadingTip(): string {
  let index = Math.floor(Math.random() * CANVAS_LOADING_TIPS.length);
  if (index === lastTipIndex) index = (index + 1) % CANVAS_LOADING_TIPS.length;
  lastTipIndex = index;
  return CANVAS_LOADING_TIPS[index];
}

/** Une séance de chargement : son départ et son astuce, tirés une fois. */
export type CanvasLoadingSession = { startedAt: number; tip: string };

export function createCanvasLoadingSession(): CanvasLoadingSession {
  return { startedAt: performance.now(), tip: pickCanvasLoadingTip() };
}
