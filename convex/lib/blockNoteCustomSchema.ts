import { BLOCK_NOTE_DEFAULT_PROPS } from "./blockNoteDocument";
import {
  PILL_DEFAULT_COLOR,
  PILL_DEFAULT_TEXT,
  PILL_DEFAULT_VARIANT,
} from "./colorPill";

// Configs des blocs et inline contents custom de BlockNote, partagées entre
// le client et le serveur.
//
// Le schéma ProseMirror d'un spec ne dépend que de sa config (type, props,
// content), jamais de son rendu. Le client les enveloppe dans des specs React
// (src/components/blocknote/*), le serveur dans des specs core au rendu
// factice (convex/blocknoteSyncNode.ts) : les deux schémas doivent rester
// identiques, sinon le doc collaboratif contiendrait des nodes que l'autre
// côté ne sait pas lire. Le test `blockNoteSyncSchema.test.ts` le vérifie.

export const calloutBlockConfig = {
  type: "callout",
  propSchema: {
    color: { default: BLOCK_NOTE_DEFAULT_PROPS.callout.color as string },
    icon: { default: BLOCK_NOTE_DEFAULT_PROPS.callout.icon as string },
  },
  content: "inline",
} as const;

export const dateInlineContentConfig = {
  type: "date",
  propSchema: {
    date: { default: "" },
  },
  content: "none",
} as const;

export const mentionInlineContentConfig = {
  type: "mention",
  propSchema: {
    nodeDataId: { default: "" },
    title: { default: "" },
  },
  content: "none",
} as const;

export const pillInlineContentConfig = {
  type: "pill",
  propSchema: {
    text: { default: PILL_DEFAULT_TEXT },
    color: { default: PILL_DEFAULT_COLOR as string },
    variant: { default: PILL_DEFAULT_VARIANT as string },
  },
  content: "none",
} as const;
