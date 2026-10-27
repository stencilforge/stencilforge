import type { Doc, Obj, TextObj } from "@/lib/types";

// Keep in sync with crates/stencil-core/src/doc.rs (checked by the vitest parity test).
export const defaultText = (): TextObj => ({
  text: "STENCIL",
  font: "allerta-stencil",
  size: 60,
  tracking: 0,
  leading: 1.15,
  align: "center",
  kerning: true,
  weight: 0,
  variations: [],
  arc: null,
});

export const defaultObj = (id = "obj1"): Obj => ({
  id,
  visible: true,
  x: 0,
  y: 0,
  rotation: 0,
  scale: 1,
  content: { type: "text", ...defaultText() },
});

export const defaultDoc = (): Doc => ({
  mode: "negative",
  mirror: false,
  thickness: 2,
  objects: [defaultObj()],
  slab: {
    shape: "rounded",
    fit: true,
    width: 200,
    height: 100,
    margins: { top: 15, right: 15, bottom: 15, left: 15 },
    radius: 8,
    frame: 6,
    mountHoles: false,
    holeDiameter: 4,
    holeInset: 7,
  },
  bridges: {
    enabled: true,
    kind: "classic",
    width: 1.6,
    minPerIsland: 2,
    strategy: "shortest",
    angle: 90,
    floatHeight: 0.8,
    maxLength: 100,
    manual: [],
    suppressed: [],
  },
  edge: { chamfer: 0, steps: 3 },
  print: { minWall: 0.8, layerHeight: 0.2, density: 1.24 },
});
