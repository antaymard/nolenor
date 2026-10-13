import { describe, expect, test } from "vitest";
import {
  matchesParsedQuery,
  narrowToPhraseChunks,
  normalizeHaystacks,
  parseSearchQuery,
} from "./searchQuery";

describe("phrases", () => {
  test("une phrase coupée par un retour à la ligne matche", () => {
    const parsed = parseSearchQuery('"scaled dot-product attention"');
    expect(
      matchesParsedQuery(
        normalizeHaystacks(["We call it Scaled Dot-Product\nAttention."]),
        parsed,
      ),
    ).toBe(true);
  });

  test("seuls les chunks qui portent la phrase restent", () => {
    const chunks = [
      { nodeDataId: "pdf", text: "Attention is all you need.", page: 1 },
      { nodeDataId: "pdf", text: "Scaled dot-product attention.", page: 4 },
      { nodeDataId: "pdf", text: "Multi-head attention uses scaled\ndot-product attention.", page: 5 },
      { nodeDataId: "doc", text: "attention, scaled and dot-product apart" },
    ];
    expect(
      narrowToPhraseChunks(chunks, ["scaled dot-product attention"]).map(
        (chunk) => chunk.page ?? chunk.nodeDataId,
      ),
    ).toEqual([4, 5, "doc"]);
  });

  test("sans phrase, rien ne change", () => {
    const chunks = [{ nodeDataId: "a", text: "x" }];
    expect(narrowToPhraseChunks(chunks, [])).toBe(chunks);
  });
});
