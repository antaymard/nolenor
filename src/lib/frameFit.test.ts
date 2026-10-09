import { describe, expect, it } from "vitest";
import { computeFrameFit } from "./frameFit";

const frame = { width: 500, height: 400 };
const rect = (x: number, y: number, width = 100, height = 50) => ({
  x,
  y,
  width,
  height,
});

describe("computeFrameFit", () => {
  it("ne touche à rien quand tout tient", () => {
    expect(computeFrameFit(frame, [rect(0, 0), rect(400, 350)])).toBeNull();
    expect(computeFrameFit(frame, [])).toBeNull();
  });

  it("grandit vers la droite et le bas, marge comprise", () => {
    expect(computeFrameFit(frame, [rect(450, 380)], { padding: 40 })).toEqual({
      shift: { x: 0, y: 0 },
      width: 590,
      height: 470,
    });
  });

  it("décale le contenu au lieu de reculer la frame vers la gauche et le haut", () => {
    expect(
      computeFrameFit(frame, [rect(-60, -10), rect(300, 200)], {
        padding: 40,
      }),
    ).toEqual({ shift: { x: 100, y: 50 }, width: 600, height: 450 });
  });

  it("garde de quoi contenir ce qui tenait déjà, après le décalage", () => {
    // Un node collé au bord droit : décalé de 100, il dépasse — la frame
    // grandit au moins du décalage.
    const fit = computeFrameFit(frame, [rect(-60, 0), rect(400, 0)], {
      padding: 40,
    });
    expect(fit?.shift).toEqual({ x: 100, y: 0 });
    expect(fit?.width).toBe(600);
  });

  it("sans décalage permis, ignore la gauche et le haut", () => {
    expect(
      computeFrameFit(frame, [rect(-60, -10)], { allowShift: false }),
    ).toBeNull();
    expect(
      computeFrameFit(frame, [rect(-60, 380)], {
        allowShift: false,
        padding: 40,
      }),
    ).toEqual({ shift: { x: 0, y: 0 }, width: 500, height: 470 });
  });
});
