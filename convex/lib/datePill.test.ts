import { describe, expect, it } from "vitest";

import {
  normalizeDatePillValue,
  parseDatePillValue,
  toIsoDateString,
} from "./datePill";

describe("toIsoDateString", () => {
  it("formats local calendar fields, not the UTC instant", () => {
    // Late-evening local time falls on the NEXT day in UTC for negative
    // offsets; the pill must still read as the local day.
    expect(toIsoDateString(new Date(2026, 6, 24, 23, 30))).toBe("2026-07-24");
    expect(toIsoDateString(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
  });

  it("zero-pads month and day", () => {
    expect(toIsoDateString(new Date(2026, 2, 9))).toBe("2026-03-09");
  });
});

describe("parseDatePillValue", () => {
  it("parses the canonical ISO form at local midnight", () => {
    const date = parseDatePillValue("2026-07-24")!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    // The whole point of parsing field by field: `new Date("2026-07-24")` is
    // UTC midnight, which is 23 July in any negative-offset timezone.
    expect(date.getDate()).toBe(24);
    expect(date.getHours()).toBe(0);
  });

  it("still parses legacy toDateString values", () => {
    const date = parseDatePillValue("Fri Jul 24 2026")!;
    expect(toIsoDateString(date)).toBe("2026-07-24");
  });

  it("returns null for empty or unparseable values", () => {
    expect(parseDatePillValue("")).toBeNull();
    expect(parseDatePillValue(undefined)).toBeNull();
    expect(parseDatePillValue(null)).toBeNull();
    expect(parseDatePillValue("not a date")).toBeNull();
  });

  it("rejects an ISO date that does not exist instead of rolling over", () => {
    expect(parseDatePillValue("2026-02-31")).toBeNull();
    expect(parseDatePillValue("2026-13-01")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(normalizeDatePillValue("2028-02-29")).toBe("2028-02-29");
  });
});

describe("normalizeDatePillValue", () => {
  it("is a no-op on canonical values", () => {
    expect(normalizeDatePillValue("2026-07-24")).toBe("2026-07-24");
  });

  it("upgrades legacy values to ISO", () => {
    expect(normalizeDatePillValue("Fri Jul 24 2026")).toBe("2026-07-24");
  });

  it("returns an empty string when there is nothing to normalize", () => {
    expect(normalizeDatePillValue("???")).toBe("");
    expect(normalizeDatePillValue("")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeDatePillValue("Fri Jul 24 2026");
    expect(normalizeDatePillValue(once)).toBe(once);
  });
});
