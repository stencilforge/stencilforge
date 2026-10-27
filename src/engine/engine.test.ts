// Runs the real WASM engine in Node to check the TS defaults match the Rust document model.
import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { defaultDoc } from "@/lib/defaults";

const root = path.resolve(__dirname, "../..");
const wasmPath = path.join(root, "src/engine/pkg/stencil_core_bg.wasm");
const have = fs.existsSync(wasmPath);

describe.skipIf(!have)("wasm engine", () => {
  let Engine: typeof import("./pkg/stencil_core").Engine;
  beforeAll(async () => {
    const mod = await import("./pkg/stencil_core");
    mod.initSync({ module: fs.readFileSync(wasmPath) });
    Engine = mod.Engine;
  });

  it("computes the default document", () => {
    const e = new Engine();
    const info = e.loadFont("allerta-stencil", fs.readFileSync(path.join(root, "public/fonts/AllertaStencil-Regular.ttf")));
    expect(info.glyphCount).toBeGreaterThan(50);
    const doc = defaultDoc();
    const out = e.compute2d(doc as never);
    expect(out.stats.width).toBeGreaterThan(100);
    expect(out.issues.filter((i) => i.severity === "error")).toEqual([]);
    // a stencil font has no closed counters, so nothing needs bridging
    expect(out.stats.islands).toBe(0);

    // a normal font does: A, B, O and 8 all have islands
    e.loadFont("archivo", fs.readFileSync(path.join(root, "public/fonts/ArchivoBlack-Regular.ttf")));
    if (doc.objects[0].content.type === "text") {
      doc.objects[0].content.font = "archivo";
      doc.objects[0].content.text = "OAB8";
    }
    const out2 = e.compute2d(doc as never);
    expect(out2.stats.islands).toBe(6); // O + A + B(2) + 8(2)
    expect(out2.bridges.length).toBeGreaterThanOrEqual(5);
    expect(out2.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("produces a watertight mesh and STL for floating bridges", () => {
    const e = new Engine();
    e.loadFont("allerta-stencil", fs.readFileSync(path.join(root, "public/fonts/AllertaStencil-Regular.ttf")));
    const doc = defaultDoc();
    doc.bridges.kind = "floating";
    if (doc.objects[0].content.type === "text") doc.objects[0].content.text = "OAB8";
    const m = e.computeMesh(doc as never);
    expect(m.openEdges).toBe(0);
    expect(m.badEdges).toBe(0);
    expect(m.volume).toBeGreaterThan(1000);
    const stl = e.exportStl(doc as never, true);
    expect(stl.length).toBe(84 + (m.indices.length / 3) * 50);
  });

  it("variable font axes are exposed", () => {
    const e = new Engine();
    const info = e.loadFont("oswald", fs.readFileSync(path.join(root, "public/fonts/Oswald-Variable.ttf")));
    expect(info.axes.some((a) => a.tag === "wght")).toBe(true);
  });
});
