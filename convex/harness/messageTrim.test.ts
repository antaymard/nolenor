import { describe, expect, test } from "vitest";
import { TRIM_MIN_CHARS, trimMessage } from "./messageTrim";

const big = "x".repeat(TRIM_MIN_CHARS);

describe("trimMessage", () => {
  test("allège un gros résultat de tool", () => {
    const trimmed = trimMessage({
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
    const trimmed = trimMessage({
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
      trimMessage({
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
    expect(trimMessage({ role: "user", content: big })).toBeNull();
  });

  test("garde le texte du raisonnement, retire ses métadonnées chiffrées", () => {
    const details = { openrouter: { reasoning_details: [{ data: big }] } };
    const trimmed = trimMessage({
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "Thinking it through",
          signature: "sig",
          providerOptions: details,
          providerMetadata: details,
        },
        { type: "redacted-reasoning", data: big },
        { type: "text", text: "Answer" },
      ],
    });
    expect(trimmed?.content).toEqual([
      { type: "reasoning", text: "Thinking it through" },
      { type: "text", text: "Answer" },
    ]);
  });
});
