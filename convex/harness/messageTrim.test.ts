import { describe, expect, test } from "vitest";
import { TRIM_MIN_CHARS, trimToolContent } from "./messageTrim";

const big = "x".repeat(TRIM_MIN_CHARS);

describe("trimToolContent", () => {
  test("allège un gros résultat de tool", () => {
    const trimmed = trimToolContent({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          toolName: "read_nodes",
          output: { type: "text", value: big },
        },
      ],
    });
    expect(trimmed?.content).toEqual([
      {
        type: "tool-result",
        toolCallId: "c1",
        toolName: "read_nodes",
        output: { type: "text", value: expect.stringContaining("removed") },
      },
    ]);
  });

  test("allège de gros arguments en gardant l'explication", () => {
    const trimmed = trimToolContent({
      role: "assistant",
      content: [
        { type: "text", text: "Writing it" },
        {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "insert_blocks",
          input: { explanation: "Adding the intro", blocks: big },
        },
      ],
    });
    expect(trimmed?.content).toEqual([
      { type: "text", text: "Writing it" },
      {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "insert_blocks",
        input: {
          explanation: "Adding the intro",
          _removed: expect.stringContaining("removed"),
        },
      },
    ]);
  });

  test("laisse les petits contenus, le texte et les tools affichés dans le chat", () => {
    expect(
      trimToolContent({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "read_nodes",
            output: { type: "text", value: "small" },
          },
          {
            type: "tool-result",
            toolCallId: "c2",
            toolName: "run_subAgent",
            output: { type: "text", value: big },
          },
        ],
      }),
    ).toBeNull();
    expect(trimToolContent({ role: "user", content: big })).toBeNull();
  });
});
