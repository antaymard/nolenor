"use client";

import { CodeBlockRules } from "@platejs/code-block";
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react";
import { all, createLowlight } from "lowlight";

import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from "@/components/plate/code-block-node";

const lowlight = createLowlight(all);

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
