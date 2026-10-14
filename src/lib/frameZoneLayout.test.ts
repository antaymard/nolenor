import { describe, expect, it } from "vitest";
import type { CanvasNode } from "@/types";
import { ZONE_HEADER_HEIGHT } from "@/../convex/lib/frameZones";
import { mergeLayoutUpdates, zoneArrangementsFor } from "./frameZoneLayout";

const kanban = { columns: ["To do", "Doing", "Done"], rows: [] };

function node(
  id: string,
  props: Partial<CanvasNode> & { x: number; y: number },
): CanvasNode {
  const { x, y, ...rest } = props;
  return {
    id,
    type: "blocknote",
    position: { x, y },
    width: 200,
    height: 100,
    ...rest,
  } as CanvasNode;
}

// Colonnes de 300 de large, déjà rangées.
const top = ZONE_HEADER_HEIGHT + 16;
const canvas = [
  node("board", { type: "frame", x: 1000, y: 1000, width: 900, height: 600 }),
  node("free", { type: "frame", x: 0, y: 0, width: 600, height: 400 }),
  node("a", { parentId: "board", x: 16, y: top }),
  node("b", { parentId: "board", x: 16, y: top + 112 }),
  node("c", { parentId: "board", x: 616, y: top }),
  node("loose", { x: 3000, y: 3000 }),
];
const zonesOf = (frame: CanvasNode) => (frame.id === "board" ? kanban : null);

describe("zoneArrangementsFor", () => {
  it("does nothing outside zoned frames", () => {
    const result = zoneArrangementsFor(
      [{ nodeId: "loose", props: { position: { x: 0, y: 0 } } }],
      canvas,
      zonesOf,
    );
    expect(result).toEqual({ after: [], before: [] });
  });

  it("stacks a node dropped into a column and closes the gap it left", () => {
    // `a` passe de « To do » à « Doing », au-dessus de rien.
    const { after, before } = zoneArrangementsFor(
      [{ nodeId: "a", props: { position: { x: 350, y: 300 } } }],
      canvas,
      zonesOf,
    );
    const merged = mergeLayoutUpdates(
      [{ nodeId: "a", props: { position: { x: 350, y: 300 } } }],
      after,
    );
    expect(merged).toEqual([
      { nodeId: "a", props: { position: { x: 316, y: top } } },
      { nodeId: "b", props: { position: { x: 16, y: top } } },
    ]);
    // `b` remonte ; l'inverse de `a` vient de l'appelant (son origine).
    expect(before).toContainEqual({
      nodeId: "b",
      props: { position: { x: 16, y: top + 112 } },
    });
  });

  it("inserts a dropped node between the two it was dropped between", () => {
    const { after } = zoneArrangementsFor(
      [{ nodeId: "c", props: { position: { x: 20, y: top + 60 } } }],
      canvas,
      zonesOf,
    );
    expect(after).toEqual([
      { nodeId: "b", props: { position: { x: 16, y: top + 224 } } },
      { nodeId: "c", props: { position: { x: 16, y: top + 112 } } },
    ]);
  });

  it("arranges a frame a node is dropped into from outside", () => {
    const { after } = zoneArrangementsFor(
      [
        {
          nodeId: "loose",
          props: { position: { x: 650, y: 500 }, parentId: "board" },
        },
      ],
      canvas,
      zonesOf,
    );
    expect(after).toContainEqual({
      nodeId: "loose",
      props: { position: { x: 616, y: top + 112 } },
    });
  });

  it("keeps zones read from the grid before a resize", () => {
    // Élargie à 1500 : les colonnes passent à 500, `c` (x=616) tomberait
    // sinon dans la deuxième.
    const { after, before } = zoneArrangementsFor(
      [{ nodeId: "board", props: { width: 1500, height: 600 } }],
      canvas,
      zonesOf,
    );
    expect(after).toEqual([
      { nodeId: "c", props: { position: { x: 1016, y: top } } },
    ]);
    expect(before).toEqual([
      { nodeId: "c", props: { position: { x: 616, y: top } } },
    ]);
  });
});

describe("mergeLayoutUpdates", () => {
  it("keeps one entry per node, the base winning when asked", () => {
    const base = [
      { nodeId: "a", props: { position: { x: 1, y: 1 }, parentId: "f" } },
    ];
    const extra = [{ nodeId: "a", props: { position: { x: 2, y: 2 } } }];
    expect(mergeLayoutUpdates(base, extra)).toEqual([
      { nodeId: "a", props: { position: { x: 2, y: 2 }, parentId: "f" } },
    ]);
    expect(mergeLayoutUpdates(base, extra, { keepBase: true })).toEqual(base);
  });
});
