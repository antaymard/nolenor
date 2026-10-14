import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { isExpectedError } from "./observability";

describe("isExpectedError", () => {
  test("ConvexError et validateur d'arguments : voulus, pas remontés", () => {
    expect(isExpectedError(new ConvexError("Canvas not found"))).toBe(true);
    expect(isExpectedError(new ConvexError({ code: "NOT_FOUND" }))).toBe(true);
    expect(
      isExpectedError(
        new Error(
          "ArgumentValidationError: Value does not match validator.\nPath: .nodeId",
        ),
      ),
    ).toBe(true);
  });

  test("le reste est un bug à suivre", () => {
    expect(isExpectedError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isExpectedError(new Error("Kaboom"))).toBe(false);
    expect(isExpectedError("fetch failed")).toBe(false);
  });
});
