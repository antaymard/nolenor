import { describe, expect, it } from "vitest";
import { orderKeyBetween, orderKeysAt, orderKeysBetween } from "./orderKeys";

describe("orderKeyBetween", () => {
  it("starts in the middle of the alphabet", () => {
    expect(orderKeyBetween(null, null)).toBe("i");
  });

  it("always fits a key between two others, on both sides", () => {
    const cases: Array<[string | null, string | null]> = [
      [null, "i"],
      ["i", null],
      ["a", "b"],
      ["01", "02"],
      [null, "01"],
      ["az", "b"],
      ["zz", null],
      ["0001", "0002"],
    ];
    for (const [before, after] of cases) {
      const key = orderKeyBetween(before, after);
      if (before !== null) expect(key > before).toBe(true);
      if (after !== null) expect(key < after).toBe(true);
      expect(key.endsWith("0")).toBe(false);
    }
  });

  it("keeps working after many insertions at the same spot", () => {
    let low: string | null = null;
    const high = "i";
    for (let i = 0; i < 200; i++) {
      const key = orderKeyBetween(low, high);
      if (low !== null) expect(key > low).toBe(true);
      expect(key < high).toBe(true);
      low = key;
    }
  });

  it("rejects bounds in the wrong order", () => {
    expect(() => orderKeyBetween("b", "a")).toThrow();
    expect(() => orderKeyBetween("a", "a")).toThrow();
  });
});

describe("orderKeysBetween", () => {
  it("gives increasing keys inside the bounds", () => {
    const keys = orderKeysBetween("a", "b", 5);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(5);
    expect(keys.every((key) => key > "a" && key < "b")).toBe(true);
  });
});

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
