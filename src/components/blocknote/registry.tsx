import type { DefaultReactSuggestionItem } from "@blocknote/react";

import type { AppBlockNoteEditor } from "./schema";
import { createCalloutBlockSpec, CalloutView } from "./callout-block";
import { getCalloutSlashMenuItem } from "./calloutSlashMenuItem";
import { dateInlineContentSpec, DatePillView } from "./date-inline-content";
import { getDateSlashMenuItem } from "./dateSlashMenuItem";
import {
  nodeMentionInlineContentSpec,
  MentionPillView,
} from "./mention-inline-content";

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
  mention: nodeMentionInlineContentSpec,
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
  {
    // No slashMenuItem: mentions are only inserted via the "@" trigger (see
    // nodeMentionSuggestions.tsx / BlocknoteWindow.tsx), not the "/" menu.
    type: "mention",
    spec: customInlineContentSpecs.mention,
    View: MentionPillView,
  },
];

/** Slash menu items for all custom components (blocks + inline content). */
export function getCustomSlashMenuItems(
  editor: AppBlockNoteEditor,
): DefaultReactSuggestionItem[] {
  return [...customBlocks, ...customInlineContent]
    .filter((entry) => entry.slashMenuItem)
    .map((entry) => entry.slashMenuItem!(editor));
}

/**
 * Stably groups suggestion items by `group` so concatenating multiple sources
 * (BlockNote's own defaults + our custom entries above) never produces two
 * separate, non-contiguous runs of the same group name.
 *
 * BlockNote's `SuggestionMenu` renders one `<Label key={group}>` every time an
 * item's group differs from the previous item's. Our custom items reuse
 * default group names ("Basic blocks" for callout, "Others" for date) — since
 * they're appended after the full default list, they reopen groups that had
 * already closed, so React sees two `<Label>` elements sharing the same key
 * ("Encountered two children with the same key"). That's undefined
 * reconciliation behavior, and exactly what produced blank-looking section
 * headers in the slash menu once the list got filtered down. Grouping the
 * combined list before filtering — not after; filtering only removes items,
 * it never reorders, so contiguity survives it — fixes it for any custom item
 * regardless of which existing group name it picks.
 *
 * Preserves the order groups first appear in, and each item's relative order
 * within its group.
 */
export function groupSuggestionItems<T extends { group?: string }>(
  items: T[],
): T[] {
  const order: string[] = [];
  const byGroup = new Map<string, T[]>();
  for (const item of items) {
    const key = item.group ?? "";
    let bucket = byGroup.get(key);
    if (!bucket) {
      bucket = [];
      byGroup.set(key, bucket);
      order.push(key);
    }
    bucket.push(item);
  }
  return order.flatMap((key) => byGroup.get(key)!);
}

// Built once at module load: the view lookups run for every block and every
// inline node of every canvas preview, so they should not scan the arrays.
const blockViewsByType = new Map(customBlocks.map((e) => [e.type, e.View]));
const inlineContentViewsByType = new Map(
  customInlineContent.map((e) => [e.type, e.View]),
);

/** Look up the read-only View component for a custom block type. */
export function findBlockView(type: string): AnyView | undefined {
  return blockViewsByType.get(type);
}

/** Look up the read-only View component for a custom inline content type. */
export function findInlineContentView(type: string): AnyView | undefined {
  return inlineContentViewsByType.get(type);
}
