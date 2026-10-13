import { expect, test } from "vitest";
import { inBatches, mapConcurrently } from "./runtime";

test("mapConcurrently : ordre préservé, jamais plus de `limit` à la fois", async () => {
  let running = 0;
  let peak = 0;
  const results = await mapConcurrently(
    [5, 1, 4, 2, 3],
    async (value) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, value));
      running--;
      return value * 10;
    },
    2,
  );
  expect(results).toEqual([50, 10, 40, 20, 30]);
  expect(peak).toBe(2);
  expect(await mapConcurrently([], async () => 1)).toEqual([]);
});

test("inBatches", () => {
  expect(inBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
});
