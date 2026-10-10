/**
 * Les astuces de l'écran de chargement du canvas : des gestes qui existent
 * mais ne se voient pas dans l'interface. Télégraphiques, à lire d'un coup
 * d'œil — geste → effet. Chacune doit rester vraie : elles recopient le
 * manuel (`convex/systemSkills/manual-shortcuts` et voisins), à tenir à jour
 * avec lui.
 *
 * Balisage, rendu en pastilles :
 * - `[Shift]` une touche. `[Mod]` et `[Alt]` prennent le libellé de la
 *   plateforme (⌘ / ⌥ sur Mac) ;
 * - `{click}` un geste de souris, parmi `GESTURES`, rendu avec son icône.
 */
export const CANVAS_LOADING_TIPS: readonly string[] = [
  "[Alt] + {click} a block → attach to Nolë",
  "[Alt] + {click} empty canvas → point Nolë there",
  "[Shift] + {drag} → alignment guides",
  "[Mod] + {drag} a block → linked blocks follow",
  "{right-click} → Appearance → switch variant",
  "{right-click} a frame → Compact → more room",
  "{click} a mention → go · [Mod] + {click} → open",
  "{right-click} a title → Scale with zoom",
  "[Mod] + lasso → skip frames",
  "{right-click} a selection → align · tidy up",
  "{drag} a connection to empty canvas → new block",
  "[T] [D] [I] [A] [L] → drop a block at the pointer",
  "[Mod] [K] → search everything, even PDFs",
  "[Mod] [P] → jump to a canvas or bookmark",
  "{right-click} canvas → Bookmark here · [B] → list",
  "[F] → draw a frame",
  "[Space] + {drag} → pan",
  "{double-click} a connection → edit its label",
  "{drag} a window to a screen edge → snap",
  "Hold [Ctrl] [Alt] in chat → dictate",
];

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform);

const KEY_LABELS: Record<string, string> = IS_MAC
  ? { Mod: "⌘", Alt: "⌥" }
  : { Mod: "Ctrl" };

export const GESTURES = [
  "click",
  "right-click",
  "double-click",
  "drag",
] as const;
export type Gesture = (typeof GESTURES)[number];

export type TipPart =
  | { kind: "text"; text: string }
  | { kind: "key"; text: string }
  | { kind: "gesture"; gesture: Gesture };

const isGesture = (value: string): value is Gesture =>
  (GESTURES as readonly string[]).includes(value);

/** Découpe une astuce en texte, touches et gestes. */
export function parseTip(tip: string): TipPart[] {
  return tip
    .split(/(\[[^\]]+\]|\{[^}]+\})/)
    .filter((chunk) => chunk !== "")
    .map((chunk): TipPart => {
      const inner = chunk.slice(1, -1);
      if (chunk.startsWith("[")) {
        return { kind: "key", text: KEY_LABELS[inner] ?? inner };
      }
      if (chunk.startsWith("{") && isGesture(inner)) {
        return { kind: "gesture", gesture: inner };
      }
      return { kind: "text", text: chunk };
    });
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
