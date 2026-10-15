import { describe, expect, it } from "vitest";
import {
  boundingRect,
  minimumScales,
  resizeSelectionRect,
  scaleSelection,
  type ScalableNode,
} from "./selectionResize";

const box = { x: 0, y: 0, width: 400, height: 200 };
const free = { minScale: { x: 0.1, y: 0.1 } };

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<ScalableNode> = {},
): ScalableNode => ({
  id,
  absolute: { x, y },
  width,
  height,
  scaleSize: true,
  ...extra,
});

describe("boundingRect", () => {
  it("englobe tous les rectangles", () => {
    expect(
      boundingRect([
        { x: 10, y: 20, width: 100, height: 50 },
        { x: -30, y: 60, width: 40, height: 100 },
      ]),
    ).toEqual({ x: -30, y: 20, width: 140, height: 140 });
    expect(boundingRect([])).toBeNull();
  });
});

describe("resizeSelectionRect", () => {
  it("tire le coin bas droit en gardant le coin haut gauche", () => {
    expect(
      resizeSelectionRect(box, "bottom-right", { x: 400, y: 100 }, free),
    ).toEqual({
      rect: { x: 0, y: 0, width: 800, height: 300 },
      scale: { x: 2, y: 1.5 },
    });
  });

  it("tire le bord gauche en gardant le bord droit, sans toucher la hauteur", () => {
    expect(resizeSelectionRect(box, "left", { x: 200, y: 999 }, free)).toEqual({
      rect: { x: 200, y: 0, width: 200, height: 200 },
      scale: { x: 0.5, y: 1 },
    });
  });

  it("ne retourne jamais le cadre", () => {
    const { scale } = resizeSelectionRect(
      box,
      "top-left",
      { x: 1000, y: 1000 },
      { minScale: { x: 0.25, y: 0.5 } },
    );
    expect(scale).toEqual({ x: 0.25, y: 0.5 });
  });
});

describe("minimumScales", () => {
  it("borne au node redimensionnable le plus petit", () => {
    expect(
      minimumScales([
        node("a", 0, 0, 500, 100),
        node("b", 0, 0, 200, 400),
        node("title", 0, 0, 10, 10, { scaleSize: false }),
      ]),
    ).toEqual({ x: 0.25, y: 0.5 });
  });

  it("n'empêche pas d'agrandir un node déjà sous le minimum", () => {
    expect(minimumScales([node("a", 0, 0, 20, 30)])).toEqual({ x: 1, y: 1 });
  });
});

describe("scaleSelection", () => {
  it("met à l'échelle positions et tailles", () => {
    const layouts = scaleSelection(
      [node("a", 0, 0, 100, 100), node("b", 200, 100, 200, 100)],
      box,
      { x: 0, y: 0, width: 800, height: 400 },
      () => undefined,
    );
    expect(layouts.get("a")).toEqual({
      position: { x: 0, y: 0 },
      width: 200,
      height: 200,
    });
    expect(layouts.get("b")).toEqual({
      position: { x: 400, y: 200 },
      width: 400,
      height: 200,
    });
  });

  it("garde la taille d'un node fixe et sa place relative dans le cadre", () => {
    const layouts = scaleSelection(
      [
        node("left", 0, 0, 100, 50, { scaleSize: false }),
        node("right", 300, 150, 100, 50, { scaleSize: false }),
      ],
      box,
      { x: 0, y: 0, width: 800, height: 400 },
      () => undefined,
    );
    expect(layouts.get("left")).toEqual({ position: { x: 0, y: 0 } });
    // Collé au coin bas droit, il y reste.
    expect(layouts.get("right")).toEqual({ position: { x: 700, y: 350 } });
  });

  it("exprime les enfants dans le repère de leur frame, emportée ou non", () => {
    const layouts = scaleSelection(
      [
        node("frame", 0, 0, 400, 200),
        node("child", 100, 50, 100, 50, { parentId: "frame" }),
        node("other", 200, 100, 100, 50, { parentId: "outside" }),
      ],
      box,
      { x: 100, y: 0, width: 800, height: 400 },
      (id) => (id === "outside" ? { x: 150, y: 50 } : undefined),
    );
    expect(layouts.get("frame")?.position).toEqual({ x: 100, y: 0 });
    // Relatif à la frame déplacée : (100 + 100·2) − 100.
    expect(layouts.get("child")?.position).toEqual({ x: 200, y: 100 });
    // Relatif à une frame restée en place : (100 + 200·2) − 150.
    expect(layouts.get("other")?.position).toEqual({ x: 350, y: 150 });
  });
});
