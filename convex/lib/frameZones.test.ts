import { describe, expect, it } from "vitest";
import {
  ZONE_HEADER_HEIGHT,
  isTimeline,
  nextColumnLabel,
  timelineColumns,
  ZONE_ROW_HEADER_WIDTH,
  arrangeInZones,
  readFrameZones,
  zoneLabel,
  zoneOf,
} from "./frameZones";

const kanban = { columns: ["To do", "Doing", "Done"], rows: [] };
const matrix = { columns: ["Urgent", "Later"], rows: ["Important", "Minor"] };

describe("readFrameZones", () => {
  it("rejects a free frame or a malformed value", () => {
    expect(readFrameZones(undefined)).toBeNull();
    expect(readFrameZones(null)).toBeNull();
    expect(readFrameZones({ columns: [] })).toBeNull();
    expect(readFrameZones({ columns: [1, 2] })).toBeNull();
  });

  it("defaults missing rows to none", () => {
    expect(readFrameZones({ columns: ["A"] })).toEqual({
      columns: ["A"],
      rows: [],
    });
  });
});

describe("zoneOf", () => {
  const size = { width: 900, height: 600 };

  it("reads the zone under the node's center", () => {
    // Colonnes de 300 : un centre à x=450 tombe dans la deuxième.
    expect(
      zoneOf(kanban, size, { x: 400, y: 100, width: 100, height: 50 }),
    ).toEqual({ column: 1, row: 0 });
  });

  it("clamps a node outside the grid to the nearest zone", () => {
    expect(
      zoneOf(kanban, size, { x: -500, y: 0, width: 10, height: 10 }),
    ).toEqual({ column: 0, row: 0 });
    expect(
      zoneOf(kanban, size, { x: 2000, y: 2000, width: 10, height: 10 }),
    ).toEqual({ column: 2, row: 0 });
  });

  it("accounts for the row header band", () => {
    const rowsSize = { width: ZONE_ROW_HEADER_WIDTH + 400, height: 400 };
    const bottomRight = {
      x: ZONE_ROW_HEADER_WIDTH + 250,
      y: ZONE_HEADER_HEIGHT + 250,
      width: 20,
      height: 20,
    };
    expect(zoneOf(matrix, rowsSize, bottomRight)).toEqual({
      column: 1,
      row: 1,
    });
    expect(zoneLabel(matrix, { column: 1, row: 1 })).toBe("Later / Minor");
  });
});

describe("arrangeInZones", () => {
  it("stacks each zone in its vertical order", () => {
    const { positions, size } = arrangeInZones({
      zones: kanban,
      size: { width: 900, height: 600 },
      children: [
        {
          id: "b",
          x: 0,
          y: 300,
          width: 200,
          height: 100,
          zone: { column: 0, row: 0 },
        },
        {
          id: "a",
          x: 50,
          y: 60,
          width: 200,
          height: 100,
          zone: { column: 0, row: 0 },
        },
        {
          id: "c",
          x: 700,
          y: 400,
          width: 200,
          height: 100,
          zone: { column: 2, row: 0 },
        },
      ],
    });
    expect(positions.get("a")).toEqual({ x: 16, y: ZONE_HEADER_HEIGHT + 16 });
    expect(positions.get("b")).toEqual({
      x: 16,
      y: ZONE_HEADER_HEIGHT + 16 + 100 + 12,
    });
    expect(positions.get("c")).toEqual({ x: 616, y: ZONE_HEADER_HEIGHT + 16 });
    expect(size).toEqual({ width: 900, height: 600 });
  });

  it("grows the frame so every column and stack fits", () => {
    const { positions, size } = arrangeInZones({
      zones: kanban,
      size: { width: 300, height: 200 },
      children: [
        {
          id: "wide",
          x: 0,
          y: 0,
          width: 268,
          height: 300,
          zone: { column: 1, row: 0 },
        },
      ],
    });
    // Colonnes égales, chacune aussi large que le node le plus large + marges.
    expect(size).toEqual({ width: 3 * 300, height: ZONE_HEADER_HEIGHT + 332 });
    expect(positions.get("wide")).toEqual({
      x: 316,
      y: ZONE_HEADER_HEIGHT + 16,
    });
  });

  it("puts nodes of a removed zone in the last one left", () => {
    const { positions } = arrangeInZones({
      zones: { columns: ["Only"], rows: [] },
      size: { width: 400, height: 400 },
      children: [
        {
          id: "a",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          zone: { column: 2, row: 3 },
        },
      ],
    });
    expect(positions.get("a")).toEqual({ x: 16, y: ZONE_HEADER_HEIGHT + 16 });
  });
});

describe("timeline", () => {
  it("lays six months from the current one, across years", () => {
    const columns = timelineColumns(new Date(2026, 9, 14));
    expect(columns).toEqual([
      "Oct 2026",
      "Nov 2026",
      "Dec 2026",
      "Jan 2027",
      "Feb 2027",
      "Mar 2027",
    ]);
    expect(isTimeline({ columns, rows: [] })).toBe(true);
    expect(nextColumnLabel({ columns, rows: [] })).toBe("Apr 2027");
  });

  it("is plain columns once a title breaks the sequence", () => {
    const zones = { columns: ["Oct 2026", "Q1", "Dec 2026"], rows: [] };
    expect(isTimeline(zones)).toBe(false);
    expect(isTimeline({ columns: ["Oct 2026", "Dec 2026"], rows: [] })).toBe(
      false,
    );
    expect(nextColumnLabel(zones)).toBe("Column 4");
  });
});
