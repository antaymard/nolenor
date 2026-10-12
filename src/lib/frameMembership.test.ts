import { describe, expect, it } from "vitest";
import { placeBesideFrame, placeInCompactFrame } from "./frameMembership";

describe("placeInCompactFrame", () => {
  it("pose les nodes en haut à gauche d'une frame vide", () => {
    const { positions, size } = placeInCompactFrame({
      incoming: [{ id: "a", x: 500, y: -300, width: 100, height: 50 }],
      existing: [],
      frameSize: { width: 400, height: 300 },
      gap: 40,
      padding: 24,
    });
    expect(positions.get("a")).toEqual({ x: 24, y: 24 });
    expect(size).toEqual({ width: 400, height: 300 });
  });

  it("range sous le contenu existant, garde la disposition et agrandit", () => {
    const { positions, size } = placeInCompactFrame({
      incoming: [
        { id: "a", x: 1000, y: 1000, width: 200, height: 100 },
        { id: "b", x: 1300, y: 1050, width: 200, height: 100 },
      ],
      existing: [{ id: "c", x: 30, y: 30, width: 300, height: 200 }],
      frameSize: { width: 400, height: 300 },
      gap: 40,
      padding: 24,
    });
    expect(positions.get("a")).toEqual({ x: 30, y: 270 });
    expect(positions.get("b")).toEqual({ x: 330, y: 320 });
    expect(size).toEqual({ width: 554, height: 444 });
  });
});

describe("placeBesideFrame", () => {
  it("pose les nodes à droite de la frame, alignés sur son bord haut", () => {
    const positions = placeBesideFrame(
      { x: 100, y: 200, width: 280 },
      [
        { id: "a", x: 50, y: 80, width: 100, height: 50 },
        { id: "b", x: 50, y: 180, width: 100, height: 50 },
      ],
      40,
    );
    expect(positions.get("a")).toEqual({ x: 420, y: 200 });
    expect(positions.get("b")).toEqual({ x: 420, y: 300 });
  });
});
