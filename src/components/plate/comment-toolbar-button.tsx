"use client";

import { MessageSquareTextIcon } from "lucide-react";
import { useEditorRef } from "platejs/react";

import { commentPlugin } from "@/components/plate/comment-kit";

import { ToolbarButton } from "../shadcn/toolbar";

export function CommentToolbarButton() {
  const editor = useEditorRef();

  return (
    <ToolbarButton
      onClick={() => {
        editor.getTransforms(commentPlugin).comment.setDraft();
      }}
      data-plate-prevent-overlay
      tooltip="Comment"
    >
      <MessageSquareTextIcon />
    </ToolbarButton>
  );
}
