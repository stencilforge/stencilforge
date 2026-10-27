import { defaultDoc, defaultObj } from "@/lib/defaults";
import type { Doc, TextObj } from "@/lib/types";

export interface Preset {
  id: string;
  name: string;
  desc: string;
  build: () => Doc;
}

function textDoc(patch: Partial<TextObj>, docPatch?: (d: Doc) => void): Doc {
  const d = defaultDoc();
  const o = defaultObj("obj1");
  if (o.content.type === "text") Object.assign(o.content, patch);
  d.objects = [o];
  docPatch?.(d);
  return d;
}

export const PRESETS: Preset[] = [
  {
    id: "classic",
    name: "Classic stencil",
    desc: "Military-style stencil lettering",
    build: () => textDoc({ text: "STENCIL", font: "allerta-stencil", size: 60 }),
  },
  {
    id: "house",
    name: "House number",
    desc: "Big numerals with floating bridges",
    build: () =>
      textDoc({ text: "1847", font: "archivo-black", size: 110, tracking: 4 }, (d) => {
        d.bridges.kind = "floating";
        d.thickness = 2.4;
        d.bridges.floatHeight = 1;
      }),
  },
  {
    id: "crate",
    name: "Crate marking",
    desc: "Two lines, hardwearing slab",
    build: () =>
      textDoc({ text: "FRAGILE\nTHIS SIDE UP", font: "black-ops-one", size: 38, leading: 1.2 }, (d) => {
        d.slab.shape = "rect";
        d.slab.mountHoles = true;
        d.thickness = 2.4;
      }),
  },
  {
    id: "badge",
    name: "Round badge",
    desc: "Text on an arc in a circular slab",
    build: () =>
      textDoc(
        { text: "WORKSHOP 24/7", font: "bebas-neue", size: 40, tracking: 4, arc: { radius: 70, inside: false, centerAngle: 90 } },
        (d) => {
          d.slab.shape = "ellipse";
          d.slab.margins = { top: 12, right: 12, bottom: 12, left: 12 };
        },
      ),
  },
  {
    id: "inverse",
    name: "Inverse logo mark",
    desc: "Letters stay solid, background gets painted",
    build: () =>
      textDoc({ text: "OAK", font: "anton", size: 90 }, (d) => {
        d.mode = "positive";
        d.slab.frame = 7;
        d.bridges.minPerIsland = 2;
      }),
  },
  {
    id: "script",
    name: "Script signature",
    desc: "Flowing script with thin joins",
    build: () =>
      textDoc({ text: "Hello", font: "pacifico", size: 70, weight: 0.4 }, (d) => {
        d.bridges.width = 1.2;
        d.slab.shape = "pill";
      }),
  },
];
