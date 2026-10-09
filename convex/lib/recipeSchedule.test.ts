import { describe, expect, test } from "vitest";
import { nextOccurrence, nextRunAt, scheduleError } from "./recipeSchedule";
import type { RecipeSchedule } from "../schemas/recipesSchema";

const PARIS = "Europe/Paris";
const iso = (ms: number) => new Date(ms).toISOString();

describe("nextOccurrence", () => {
  test("hour: next local minute 0", () => {
    const after = Date.parse("2026-10-09T10:17:42.500Z");
    expect(
      iso(
        nextOccurrence(
          { kind: "schedule", every: "hour", timezone: PARIS },
          after,
        ),
      ),
    ).toBe("2026-10-09T11:00:00.000Z");
  });

  test("hour: follows half-hour offsets", () => {
    // Kolkata = UTC+5:30 : la minute 0 locale tombe à la minute 30 UTC.
    const after = Date.parse("2026-10-09T10:17:00Z");
    expect(
      iso(
        nextOccurrence(
          { kind: "schedule", every: "hour", timezone: "Asia/Kolkata" },
          after,
        ),
      ),
    ).toBe("2026-10-09T10:30:00.000Z");
  });

  test("hour: exactly on the hour moves to the next one", () => {
    const after = Date.parse("2026-10-09T11:00:00Z");
    expect(
      iso(
        nextOccurrence(
          { kind: "schedule", every: "hour", timezone: "UTC" },
          after,
        ),
      ),
    ).toBe("2026-10-09T12:00:00.000Z");
  });

  test("day: later today, in the user's timezone", () => {
    // 9 h à Paris en octobre (UTC+2) = 7 h UTC.
    const after = Date.parse("2026-10-09T05:00:00Z");
    const schedule = {
      kind: "schedule",
      every: "day",
      at: "09:00",
      timezone: PARIS,
    } as const;
    expect(iso(nextOccurrence(schedule, after))).toBe(
      "2026-10-09T07:00:00.000Z",
    );
  });

  test("day: already past today, so tomorrow", () => {
    const after = Date.parse("2026-10-09T07:00:00Z");
    const schedule = {
      kind: "schedule",
      every: "day",
      at: "09:00",
      timezone: PARIS,
    } as const;
    expect(iso(nextOccurrence(schedule, after))).toBe(
      "2026-10-10T07:00:00.000Z",
    );
  });

  test("day: across the end of daylight saving time", () => {
    // Passage à l'heure d'hiver le 25 octobre 2026 : 9 h devient 8 h UTC.
    const after = Date.parse("2026-10-24T08:00:00Z");
    const schedule = {
      kind: "schedule",
      every: "day",
      at: "09:00",
      timezone: PARIS,
    } as const;
    expect(iso(nextOccurrence(schedule, after))).toBe(
      "2026-10-25T08:00:00.000Z",
    );
  });

  test("day: across a month end", () => {
    const after = Date.parse("2026-10-31T23:00:00Z");
    const schedule = {
      kind: "schedule",
      every: "day",
      at: "08:30",
      timezone: "UTC",
    } as const;
    expect(iso(nextOccurrence(schedule, after))).toBe(
      "2026-11-01T08:30:00.000Z",
    );
  });

  test("week: next matching weekday", () => {
    // Vendredi 9 octobre 2026 ; prochain lundi (1) ou jeudi (4) = lundi 12.
    const after = Date.parse("2026-10-09T12:00:00Z");
    const schedule: RecipeSchedule = {
      kind: "schedule",
      every: "week",
      at: "08:00",
      days: [1, 4],
      timezone: PARIS,
    };
    expect(iso(nextOccurrence(schedule, after))).toBe(
      "2026-10-12T06:00:00.000Z",
    );
  });

  test("week: same weekday already past waits a week", () => {
    const after = Date.parse("2026-10-09T12:00:00Z"); // vendredi, 14 h à Paris
    const schedule: RecipeSchedule = {
      kind: "schedule",
      every: "week",
      at: "08:00",
      days: [5],
      timezone: PARIS,
    };
    expect(iso(nextOccurrence(schedule, after))).toBe(
      "2026-10-16T06:00:00.000Z",
    );
  });
});

describe("nextRunAt", () => {
  test("earliest schedule wins; manual triggers are ignored", () => {
    const after = Date.parse("2026-10-09T05:00:00Z");
    expect(
      iso(
        nextRunAt(
          [
            { kind: "manual" },
            { kind: "schedule", every: "day", at: "18:00", timezone: "UTC" },
            { kind: "schedule", every: "day", at: "06:00", timezone: "UTC" },
          ],
          after,
        )!,
      ),
    ).toBe("2026-10-09T06:00:00.000Z");
  });

  test("no schedule, no next run", () => {
    expect(nextRunAt([{ kind: "manual" }], Date.now())).toBeUndefined();
  });
});

describe("scheduleError", () => {
  test("accepts valid schedules", () => {
    expect(
      scheduleError({ kind: "schedule", every: "hour", timezone: PARIS }),
    ).toBeNull();
    expect(
      scheduleError({
        kind: "schedule",
        every: "week",
        at: "23:59",
        days: [0, 6],
        timezone: PARIS,
      }),
    ).toBeNull();
  });

  test("rejects bad values", () => {
    expect(
      scheduleError({
        kind: "schedule",
        every: "hour",
        timezone: "Mars/Olympus",
      }),
    ).toMatch(/timezone/);
    expect(
      scheduleError({
        kind: "schedule",
        every: "day",
        at: "9:00",
        timezone: PARIS,
      }),
    ).toMatch(/HH:MM/);
    expect(
      scheduleError({
        kind: "schedule",
        every: "day",
        at: "24:00",
        timezone: PARIS,
      }),
    ).toMatch(/HH:MM/);
    expect(
      scheduleError({
        kind: "schedule",
        every: "week",
        at: "08:00",
        days: [],
        timezone: PARIS,
      }),
    ).toMatch(/at least one day/);
    expect(
      scheduleError({
        kind: "schedule",
        every: "week",
        at: "08:00",
        days: [7],
        timezone: PARIS,
      }),
    ).toMatch(/0 \(Sunday\)/);
    expect(
      scheduleError({
        kind: "schedule",
        every: "week",
        at: "08:00",
        days: [1, 1],
        timezone: PARIS,
      }),
    ).toMatch(/repeat/);
  });
});
