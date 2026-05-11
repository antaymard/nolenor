"use client";

import {
  KEYS,
  createSlatePlugin,
  createTextSubstitutionInputRule,
} from "platejs";

const textSubstitutionPatterns = [
  { format: "…", match: "..." },
  { format: ["“", "”"] as const, match: '""' },
  { format: ["‘", "’"] as const, match: "''" },
  { format: "©", match: ["(c)", "&copy;"] },
  { format: "®", match: ["(r)", "&reg;"] },
  { format: "™", match: ["(tm)", "&trade;"] },
  { format: "→", match: "->" },
  { format: "←", match: "<-" },
  { format: "⇒", match: "=>" },
  { format: "⇔", match: "<=>" },
  { format: "≤", match: "<=" },
  { format: "≥", match: ">=" },
  { format: "≠", match: "!=" },
  { format: "±", match: "+-" },
];

const AutoformatSubstitutionsPlugin = createSlatePlugin({
  key: "autoformatSubstitutions",
  inputRules: [
    createTextSubstitutionInputRule({
      enabled: ({ editor }) =>
        !editor.api.some({
          match: { type: [editor.getType(KEYS.codeBlock)] },
        }),
      patterns: textSubstitutionPatterns,
    }),
  ],
});

export const AutoformatKit = [AutoformatSubstitutionsPlugin];
