"use client";

import { type Value, TrailingBlockPlugin } from "platejs";
import { type TPlateEditor, useEditorRef } from "platejs/react";

// AI have been removed
import { AlignKit } from "@/components/plate/align-kit";
import { AutoformatKit } from "@/components/plate/autoformat-kit";
import { BasicBlocksKit } from "@/components/plate/basic-blocks-kit";
import { BasicMarksKit } from "@/components/plate/basic-marks-kit";
import { BlockMenuKit } from "@/components/plate/block-menu-kit";
import { BlockPlaceholderKit } from "@/components/plate/block-placeholder-kit";
import { CalloutKit } from "@/components/plate/callout-kit";
import { CodeBlockKit } from "@/components/plate/code-block-kit";
import { ColumnKit } from "@/components/plate/column-kit";
import { CommentKit } from "@/components/plate/comment-kit";
import { CursorOverlayKit } from "@/components/plate/cursor-overlay-kit";
import { DateKit } from "@/components/plate/date-kit";
import { DiscussionKit } from "@/components/plate/discussion-kit";
import { DndKit } from "@/components/plate/dnd-kit";
import { DocxKit } from "@/components/plate/docx-kit";
import { StripFontOnPastePlugin } from "@/components/plate/strip-font-on-paste-plugin";
import { ExitBreakKit } from "@/components/plate/exit-break-kit";
import { FixedToolbarKit } from "@/components/plate/fixed-toolbar-kit";
import { FontKit } from "@/components/plate/font-kit";
import { LineHeightKit } from "@/components/plate/line-height-kit";
import { LinkKit } from "@/components/plate/link-kit";
import { ListKit } from "@/components/plate/list-kit";
import { MarkdownKit } from "@/components/plate/markdown-kit";
import { MediaKit } from "@/components/plate/media-kit";
import { MentionKit } from "@/components/plate/mention-kit";
import { SlashKit } from "@/components/plate/slash-kit";
import { SuggestionKit } from "@/components/plate/suggestion-kit";
import { TableKit } from "@/components/plate/table-kit";
import { TocKit } from "@/components/plate/toc-kit";
import { ToggleKit } from "@/components/plate/toggle-kit";

export const EditorKit = [
  // Elements
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...TableKit,
  ...ToggleKit,
  ...TocKit,
  ...MediaKit,
  ...CalloutKit,
  ...ColumnKit,
  ...DateKit,
  ...LinkKit,
  ...MentionKit,

  // Marks
  ...BasicMarksKit,
  ...FontKit,

  // Block Style
  ...ListKit,
  ...AlignKit,
  ...LineHeightKit,

  // Collaboration
  ...DiscussionKit,
  ...CommentKit,
  ...SuggestionKit,

  // Editing
  ...SlashKit,
  ...AutoformatKit,
  ...CursorOverlayKit,
  ...BlockMenuKit,
  ...DndKit,
  ...ExitBreakKit,
  TrailingBlockPlugin,

  // Parsers
  ...DocxKit,
  ...MarkdownKit,
  StripFontOnPastePlugin,

  // UI
  ...BlockPlaceholderKit,
  ...FixedToolbarKit,
  // ...FloatingToolbarKit,
];

export type MyEditor = TPlateEditor<Value, (typeof EditorKit)[number]>;

export const useEditor = () => useEditorRef<MyEditor>();
