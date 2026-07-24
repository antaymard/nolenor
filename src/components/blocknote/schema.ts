import {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";

import { dateInlineContentSpec } from "./date-inline-content";
import { createCalloutBlockSpec } from "./callout-block";

/**
 * Shared BlockNote schema for the app editors: default blocks/styles plus the
 * custom `callout` block and `date` inline content (see callout-block.tsx and
 * date-inline-content.tsx).
 *
 * NOTE: `BlockNoteSchema.create` REPLACES the default specs when `blockSpecs`
 * or `inlineContentSpecs` are provided, so the defaults must be spread in.
 *
 * Any editor that reads or writes documents containing these custom types must
 * use this schema: a default-schema editor throws "node type X not found in
 * schema" when converting such documents (canvas node previews, exports).
 */
export const blockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    callout: createCalloutBlockSpec(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    date: dateInlineContentSpec,
  },
});

export type AppBlockNoteEditor = BlockNoteEditor<
  typeof blockNoteSchema.blockSchema,
  typeof blockNoteSchema.inlineContentSchema,
  typeof blockNoteSchema.styleSchema
>;
