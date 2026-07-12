"use client";
import type { FC } from "react";
import ShikiHighlighter, { type ShikiHighlighterProps } from "react-shiki";
import type { SyntaxHighlighterProps as AUIProps } from "@assistant-ui/react-markdown";

/**
 * Props for the SyntaxHighlighter component
 */
export type HighlighterProps = Omit<
  ShikiHighlighterProps,
  "children" | "theme"
> & {
  theme?: ShikiHighlighterProps["theme"];
} & Partial<Pick<AUIProps, "node" | "components">> &
  Pick<AUIProps, "language" | "code">;

/**
 * SyntaxHighlighter component, using react-shiki
 * Use it by passing to `defaultComponents` in `markdown-text.tsx`
 *
 * @example
 * const defaultComponents = {
 *   SyntaxHighlighter,
 *   h1: //...
 *   //...other elements...
 * };
 */
export const SyntaxHighlighter: FC<HighlighterProps> = ({
  code,
  language,
  theme = { light: "kanagawa-wave", dark: "kanagawa-lotus" },
  className,
  ...props
}) => {
  return (
    <ShikiHighlighter
      {...props}
      language={language}
      showLanguage={false}
      theme={theme}
      className={className}
    >
      {code.trim()}
    </ShikiHighlighter>
  );
};

SyntaxHighlighter.displayName = "SyntaxHighlighter";
