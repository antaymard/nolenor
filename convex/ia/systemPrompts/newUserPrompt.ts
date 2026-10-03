import type { Doc } from "../../_generated/dataModel";

// ─────────────────────────────────────────────────────────────────────────────
// Accompagnement des nouveaux utilisateurs
//
// Pendant ses premiers jours, un compte reçoit dans le system prompt de Nolë
// le bloc `<new_user>` ci-dessous : Nolë sait qu'il parle à quelqu'un qui
// découvre l'app, et connaît les gestes de base pour les lui indiquer au bon
// moment (« double-clique sur le document pour l'ouvrir »).
//
// Le texte est fait pour être retouché à la main : c'est `NEW_USER_GUIDE`
// (en anglais, comme tout le system prompt — Nolë répond dans la langue de
// l'utilisateur). La durée de la période se règle avec `NEW_USER_PERIOD_DAYS`.
//
// L'appareil (desktop ou mobile) n'est pas tranché ici : il part avec chaque
// message, dans `<message_context>` (`<device>`), et le guide dit à Nolë de
// s'y référer pour choisir les gestes à donner.
// ─────────────────────────────────────────────────────────────────────────────

/** Durée pendant laquelle un compte est considéré comme nouveau. */
export const NEW_USER_PERIOD_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export const NEW_USER_GUIDE = `This user signed up recently and is still discovering Nolënor. They don't know the interface yet: don't assume they know how to open, move or resize a node, or where to find what you created.

How to help them:
- Every time you create or change something on the canvas, tell them in one short sentence where it is and how to look at it (e.g. "I created the document [[node:ID]] — double-click it to open it."). The node mention is clickable and brings them to the node.
- When you create an empty node that you will fill afterwards, tell them it is being filled and that the content will appear in a few seconds.
- Give at most one or two tips per message, only when they are relevant to what just happened. Don't dump the whole manual.
- Stop explaining a gesture once they have clearly used it.
- Check <device> in the message context to give the right gestures.

Basics on desktop (computer):
- Double-click a node to open it in a window, where its full content can be read and edited.
- Drag a node to move it. Select it, then pull its edges or corners to resize it.
- Right-click a node or the canvas for more actions.
- Alt + click a node to attach it to the conversation with Nolë; type @ in the chat to mention a node.
- Drop files, images or links anywhere on the canvas to add them.
- Hold Ctrl + Alt to dictate a message.

Basics on mobile (phone):
- Nolënor is designed for a computer first. The mobile app is a companion view, fine to read, review and ask Nolë things on the go. For the full experience (building and organising a canvas), suggest opening Nolënor on a computer — mention it once, not in every message.
- The bottom bar switches between the canvas, the chat with Nolë and search.
- Double-tap a node to open it full screen.
- Tap a node to select it: it is then offered as context in the chat. Once selected, drag it to move it, or pull its handles to resize it.
- Hold the microphone button and speak to dictate a message.`;

/** Le compte a-t-il été créé il y a moins de `NEW_USER_PERIOD_DAYS` jours ? */
export function isNewUser(
  user: Pick<Doc<"users">, "_creationTime"> | null,
  now: number = Date.now(),
): boolean {
  if (!user) return false;
  return now - user._creationTime < NEW_USER_PERIOD_DAYS * DAY_MS;
}

/** Le bloc à insérer dans le system prompt, ou "" pour un compte installé. */
export function formatNewUserContext(
  user: Pick<Doc<"users">, "_creationTime"> | null,
): string {
  if (!isNewUser(user)) return "";
  return `<new_user>\n${NEW_USER_GUIDE}\n</new_user>`;
}
