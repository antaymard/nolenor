import { describe, expect, it } from "vitest";
import { orderKeysAt } from "./boardPlacement";

const between = (key: string, low: string | null, high: string | null) =>
  (low === null || key > low) && (high === null || key < high);

describe("orderKeysAt", () => {
  const siblings = [{ order: "c" }, { order: "f" }, { order: "m" }];

  it("fits the keys between the neighbours at the index", () => {
    const [key] = orderKeysAt(siblings, 1, 1);
    expect(between(key, "c", "f")).toBe(true);
  });

  it("goes first or last at the ends", () => {
    expect(orderKeysAt(siblings, 0, 1)[0] < "c").toBe(true);
    expect(orderKeysAt(siblings, 3, 1)[0] > "m").toBe(true);
    expect(orderKeysAt([], 0, 1)).toHaveLength(1);
  });

  it("keeps several inserted nodes in order", () => {
    const keys = orderKeysAt(siblings, 2, 3);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every((key) => between(key, "f", "m"))).toBe(true);
  });

  it("skips neighbours without a key", () => {
    const [key] = orderKeysAt([{ order: "c" }, {}, { order: "m" }], 2, 1);
    expect(between(key, "c", "m")).toBe(true);
  });

  it("goes after equal neighbours instead of failing", () => {
    const [key] = orderKeysAt([{ order: "f" }, { order: "f" }], 1, 1);
    expect(key > "f").toBe(true);
  });
});
