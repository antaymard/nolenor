import {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";

import {
  customBlockSpecs,
  customInlineContentSpecs,
} from "./registry";

/**
 * Shared BlockNote schema for the app editors: default blocks/styles plus the
 * custom `callout` block and `date` inline content declared in the registry.
 *
 * NOTE: `BlockNoteSchema.create` REPLACES the default specs when `blockSpecs`
 * or `inlineContentSpecs` are provided, so the defaults must be spread in.
 *
 * Any editor that reads or writes documents containing these custom types must
 * use this schema: a default-schema editor throws "node type X not found in
 * schema" when converting such documents (canvas node previews, exports).
 *
 * The custom specs come from the registry (src/components/blocknote/registry.tsx),
 * the single source of truth for custom BlockNote components. The literal-keyed
 * `customBlockSpecs` / `customInlineContentSpecs` objects are spread (not built
 * via a helper returning Record<string, ...>) so `BlockNoteSchema.create`
 * infers a widened editor type that knows about the custom `callout` and
 * `date` types — this keeps the slash-menu factories (`{ type: "callout" }`,
 * `{ type: "date" }`) type-checking.
 */
export const blockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    ...customBlockSpecs,
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    ...customInlineContentSpecs,
  },
});

export type AppBlockNoteEditor = BlockNoteEditor<
  typeof blockNoteSchema.blockSchema,
  typeof blockNoteSchema.inlineContentSchema,
  typeof blockNoteSchema.styleSchema
>;
