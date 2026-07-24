import type { DefaultReactSuggestionItem } from "@blocknote/react";

import type { AppBlockNoteEditor } from "./schema";
import { createCalloutBlockSpec } from "./callout-block";
import { CalloutView } from "./callout-block";
import { getCalloutSlashMenuItem } from "./calloutSlashMenuItem";
import { dateInlineContentSpec } from "./date-inline-content";
import { DatePillView } from "./date-inline-content";
import { getDateSlashMenuItem } from "./dateSlashMenuItem";

/**
 * Registry of custom BlockNote components — single source of truth.
 *
 * Each custom block or inline content is declared in one place with everything
 * needed across all surfaces:
 *   - `spec`: the BlockNote spec (config + render + toExternalHTML) used to
 *     build `blockNoteSchema` (see schema.ts, which spreads the literal-keyed
 *     `customBlockSpecs` / `customInlineContentSpecs` objects below so
 *     `BlockNoteSchema.create` infers the widened editor type).
 *   - `View`: the read-only React component used by the canvas read-only
 *     renderer (BlockNoteStatic). It must be free of interactivity (no
 *     popovers, no state) — this is the key that lets the canvas render custom
 *     blocks as plain React without the fragile `createRoot`-in-render path of
 *     `blocksToFullHTML` that silently failed for React specs under React 19 +
 *     StrictMode.
 *   - `slashMenuItem?`: factory adding the component to the editor slash menu.
 *
 * Adding a new custom component = add a literal-keyed entry to the specs
 * objects AND an entry to the arrays. No manual wiring in schema.ts or
 * BlocknoteWindow.tsx anymore.
 *
 * The `View` of each entry should stay in sync with the spec's `toExternalHTML`
 * (clipboard/HTML export). By convention both call the same extracted
 * component (e.g. `CalloutView`, `DatePillView`).
 */

// ── Literal-keyed spec objects (for BlockNoteSchema.create inference) ───────
// Declared separately from the arrays so the keys (`callout`, `date`) stay
// literal in the type system — spreading these into `BlockNoteSchema.create`
// widens the editor type to know about the custom types.
export const customBlockSpecs = {
  callout: createCalloutBlockSpec(),
};

export const customInlineContentSpecs = {
  date: dateInlineContentSpec,
};

// ── Entries (source of truth for Views + slash menu + lookups) ──────────────
// `View` is intentionally `React.ComponentType<any>` (same pattern as the
// prebuilt-nodes registry in prebuiltNodesConfig.ts): the registry holds
// heterogeneous components with different prop shapes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyView = React.ComponentType<any>;

export interface CustomBlockEntry {
  type: string;
  spec: (typeof customBlockSpecs)[keyof typeof customBlockSpecs];
  View: AnyView;
  slashMenuItem?: (editor: AppBlockNoteEditor) => DefaultReactSuggestionItem;
}

export interface CustomInlineContentEntry {
  type: string;
  spec: (typeof customInlineContentSpecs)[keyof typeof customInlineContentSpecs];
  View: AnyView;
  slashMenuItem?: (editor: AppBlockNoteEditor) => DefaultReactSuggestionItem;
}

export const customBlocks: CustomBlockEntry[] = [
  {
    type: "callout",
    spec: customBlockSpecs.callout,
    View: CalloutView,
    slashMenuItem: getCalloutSlashMenuItem,
  },
];

export const customInlineContent: CustomInlineContentEntry[] = [
  {
    type: "date",
    spec: customInlineContentSpecs.date,
    View: DatePillView,
    slashMenuItem: getDateSlashMenuItem,
  },
];

/** Slash menu items for all custom components (blocks + inline content). */
export function getCustomSlashMenuItems(
  editor: AppBlockNoteEditor,
): DefaultReactSuggestionItem[] {
  const items: DefaultReactSuggestionItem[] = [];
  for (const entry of customBlocks) {
    if (entry.slashMenuItem) items.push(entry.slashMenuItem(editor));
  }
  for (const entry of customInlineContent) {
    if (entry.slashMenuItem) items.push(entry.slashMenuItem(editor));
  }
  return items;
}

/** Look up the read-only View component for a custom block type. */
export function findBlockView(type: string): AnyView | undefined {
  return customBlocks.find((e) => e.type === type)?.View;
}

/** Look up the read-only View component for a custom inline content type. */
export function findInlineContentView(type: string): AnyView | undefined {
  return customInlineContent.find((e) => e.type === type)?.View;
}
