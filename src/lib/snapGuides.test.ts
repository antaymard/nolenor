import { describe, expect, it } from "vitest";
import { computeSnap, unionRect } from "./snapGuides";

const rect = (x: number, y: number, width = 100, height = 50) => ({
  x,
  y,
  width,
  height,
});

describe("computeSnap", () => {
  it("ne bouge rien sans voisin ni hors de portée", () => {
    expect(computeSnap(rect(0, 0), [], 6)).toEqual({
      dx: 0,
      dy: 0,
      guides: { alignments: [], spacings: [] },
    });
    const far = computeSnap(rect(0, 0), [rect(500, 500)], 6);
    expect(far.dx).toBe(0);
    expect(far.dy).toBe(0);
    expect(far.guides.alignments).toEqual([]);
  });

  it("aligne les bords gauches et trace le trait avec ses croix", () => {
    const result = computeSnap(rect(204, 300, 60, 50), [rect(200, 0)], 6);
    expect(result.dx).toBe(-4);
    expect(result.dy).toBe(0);
    expect(result.guides.alignments).toEqual([
      { axis: "x", pos: 200, from: 0, to: 350, marks: [300, 350, 0, 50] },
    ]);
  });

  it("aligne les centres quand c'est l'aimant le plus proche", () => {
    // Centre mobile à 252, centre voisin à 250 ; aucun bord à moins de 6.
    const result = computeSnap(rect(212, 300, 80, 50), [rect(200, 0)], 6);
    expect(result.dx).toBe(-2);
    expect(result.guides.alignments.map((g) => g.pos)).toEqual([250]);
  });

  it("aimante les deux axes à la fois", () => {
    const result = computeSnap(
      rect(303, 103),
      [rect(300, 0), rect(0, 100)],
      6,
    );
    expect(result.dx).toBe(-3);
    expect(result.dy).toBe(-3);
    const axes = result.guides.alignments.map((g) => `${g.axis}:${g.pos}`);
    expect(axes).toContain("x:300");
    expect(axes).toContain("y:100");
  });

  it("montre toutes les coïncidences, pas seulement l'aimant gagnant", () => {
    // Même largeur : gauche, centre et droite s'alignent ensemble.
    const result = computeSnap(rect(201, 300), [rect(200, 0)], 6);
    expect(result.guides.alignments.map((g) => g.pos)).toEqual([
      200, 250, 300,
    ]);
  });

  it("se centre entre deux voisins d'une même rangée", () => {
    // Voisins : [0,100] et [300,400] → libre 200 - 100 = 100, écart 50.
    // Décalé de 10 en y, hors de portée de tout alignement vertical.
    const result = computeSnap(
      rect(153, 10),
      [rect(0, 0), rect(300, 0)],
      6,
    );
    expect(result.dx).toBe(-3);
    expect(result.dy).toBe(0);
    expect(result.guides.spacings).toEqual([
      { axis: "x", start: 100, end: 150, cross: 30 },
      { axis: "x", start: 250, end: 300, cross: 30 },
    ]);
  });

  it("prolonge une rangée avec le même écart", () => {
    // A [0,100], B [140,240] : écart 40 → le mobile se pose à 280.
    const result = computeSnap(
      rect(284, 200, 60, 50),
      [rect(0, 200), rect(140, 200)],
      6,
    );
    expect(result.dx).toBe(-4);
    expect(result.guides.spacings).toEqual([
      { axis: "x", start: 100, end: 140, cross: 225 },
      { axis: "x", start: 240, end: 280, cross: 225 },
    ]);
  });

  it("prolonge une rangée vers l'amont, verticalement", () => {
    // A [100,150], B [200,250] en y : écart 50 → le mobile finit à 50.
    const result = computeSnap(
      rect(0, 3, 100, 50),
      [rect(0, 100), rect(0, 200)],
      6,
    );
    expect(result.dy).toBe(-3);
    expect(result.guides.spacings.map((s) => [s.start, s.end])).toEqual([
      [50, 100],
      [150, 200],
    ]);
  });

  it("ignore l'espacement de voisins hors de la rangée", () => {
    const result = computeSnap(
      rect(284, 900, 60, 50),
      [rect(0, 200), rect(140, 200)],
      6,
    );
    expect(result.guides.spacings).toEqual([]);
  });
});

describe("unionRect", () => {
  it("englobe tous les rectangles", () => {
    expect(unionRect([rect(0, 0), rect(200, 100, 50, 50)])).toEqual({
      x: 0,
      y: 0,
      width: 250,
      height: 150,
    });
    expect(unionRect([])).toBeNull();
  });
});
