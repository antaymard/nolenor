"use client";

import { CodeBlockRules } from "@platejs/code-block";
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react";
// `common` (~37 languages) instead of `all` (~190): saves ~1 MB of
// highlight.js grammars in the bundle; unknown languages render as plain text.
import { common, createLowlight } from "lowlight";

import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from "@/components/plate/code-block-node";

const lowlight = createLowlight(common);

// See basic-blocks-kit.tsx for why .configure() must take a function.
export const CodeBlockKit = [
  CodeBlockPlugin.configure(() => ({
    inputRules: [
      CodeBlockRules.markdown({ on: "match" }),
      CodeBlockRules.markdown({ on: "break" }),
    ],
    node: { component: CodeBlockElement },
    options: { lowlight },
    shortcuts: { toggle: { keys: "mod+alt+8" } },
  })),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
