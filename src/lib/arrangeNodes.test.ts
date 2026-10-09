import { describe, expect, it } from "vitest";
import {
  arrangeRects,
  detectLayout,
  suggestedCommands,
  type ArrangeRect,
} from "./arrangeNodes";

const rect = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 50,
): ArrangeRect => ({ id, x, y, width, height });

const positions = (map: Map<string, { x: number; y: number }>) =>
  Object.fromEntries(map);

describe("arrangeRects — alignement", () => {
  const rects = [rect("a", 0, 0, 100, 50), rect("b", 40, 200, 200, 80)];

  it("aligne sur les bords de la boîte englobante", () => {
    expect(positions(arrangeRects(rects, "left"))).toEqual({
      b: { x: 0, y: 200 },
    });
    expect(positions(arrangeRects(rects, "right"))).toEqual({
      a: { x: 140, y: 0 },
    });
    expect(positions(arrangeRects(rects, "top"))).toEqual({
      b: { x: 40, y: 0 },
    });
    expect(positions(arrangeRects(rects, "bottom"))).toEqual({
      a: { x: 0, y: 230 },
    });
  });

  it("centre sur le milieu de la boîte englobante", () => {
    // Boîte : x 0 → 240, milieu 120.
    expect(positions(arrangeRects(rects, "hcenter"))).toEqual({
      a: { x: 70, y: 0 },
      b: { x: 20, y: 200 },
    });
    // Boîte : y 0 → 280, milieu 140.
    expect(positions(arrangeRects(rects, "vcenter"))).toEqual({
      a: { x: 0, y: 115 },
      b: { x: 40, y: 100 },
    });
  });

  it("ne rend rien pour un node seul ou déjà aligné", () => {
    expect(arrangeRects([rect("a", 0, 0)], "left").size).toBe(0);
    expect(
      arrangeRects([rect("a", 0, 0), rect("b", 0, 100)], "left").size,
    ).toBe(0);
  });
});

describe("arrangeRects — distribution", () => {
  it("répartit les écarts sans bouger les extrêmes", () => {
    // Étendue 0 → 500, occupé 300 → écart 100.
    const rects = [rect("a", 0, 0), rect("b", 130, 10), rect("c", 400, 0)];
    expect(positions(arrangeRects(rects, "distributeH"))).toEqual({
      b: { x: 200, y: 10 },
    });
  });

  it("trie par centre, quel que soit l'ordre de la sélection", () => {
    const rects = [rect("c", 0, 400), rect("a", 0, 0), rect("b", 0, 120)];
    // Étendue 0 → 450, occupé 150 → écart 150.
    expect(positions(arrangeRects(rects, "distributeV"))).toEqual({
      b: { x: 0, y: 200 },
    });
  });

  it("demande au moins trois nodes", () => {
    expect(
      arrangeRects([rect("a", 0, 0), rect("b", 300, 0)], "distributeH").size,
    ).toBe(0);
  });
});

describe("detectLayout", () => {
  it("reconnaît une rangée, une colonne, une grille", () => {
    expect(
      detectLayout([rect("a", 0, 0), rect("b", 150, 10), rect("c", 320, -5)]),
    ).toBe("row");
    expect(
      detectLayout([rect("a", 0, 0), rect("b", 8, 90), rect("c", -4, 170)]),
    ).toBe("column");
    expect(
      detectLayout([
        rect("a", 0, 0),
        rect("b", 150, 4),
        rect("c", 2, 100),
        rect("d", 148, 104),
      ]),
    ).toBe("grid");
  });

  it("ne voit pas de grille dans un escalier ou une rangée incomplète", () => {
    expect(
      detectLayout([rect("a", 0, 0), rect("b", 150, 100), rect("c", 300, 200)]),
    ).toBe("scattered");
    expect(
      detectLayout([rect("a", 0, 0), rect("b", 150, 0), rect("c", 75, 100)]),
    ).toBe("scattered");
  });
});

describe("arrangeRects — tidy up", () => {
  it("remet une grille au carré avec l'écart médian", () => {
    const rects = [
      rect("a", 0, 0),
      rect("b", 135, 6),
      rect("c", 4, 95),
      rect("d", 150, 100),
    ];
    // Écarts horizontaux 35 et 46 → 40,5 → 41 ; verticaux 39 → 39.
    expect(positions(arrangeRects(rects, "tidy"))).toEqual({
      b: { x: 141, y: 0 },
      c: { x: 0, y: 89 },
      d: { x: 141, y: 89 },
    });
  });

  it("ne touche pas une sélection sans structure", () => {
    const rects = [rect("a", 0, 0), rect("b", 150, 100), rect("c", 300, 200)];
    expect(arrangeRects(rects, "tidy").size).toBe(0);
  });
});

describe("suggestedCommands", () => {
  it("propose ce qui sert à une rangée, sans les no-op", () => {
    const row = [rect("a", 0, 0), rect("b", 130, 10), rect("c", 400, 0)];
    expect(suggestedCommands(row)).toEqual(["top", "distributeH", "tidy"]);

    const aligned = [rect("a", 0, 0), rect("b", 200, 0), rect("c", 400, 0)];
    expect(suggestedCommands(aligned)).toEqual([]);
  });

  it("propose ce qui sert à une colonne", () => {
    const column = [rect("a", 0, 0), rect("b", 10, 100), rect("c", 0, 300)];
    expect(suggestedCommands(column)).toEqual(["left", "distributeV", "tidy"]);
  });

  it("ne propose rien pour un nuage de nodes", () => {
    expect(
      suggestedCommands([rect("a", 0, 0), rect("b", 150, 100), rect("c", 300, 200)]),
    ).toEqual([]);
  });
});
