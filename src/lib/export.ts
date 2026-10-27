import { zipSync, strToU8 } from "fflate";
import { engine } from "@/engine/client";
import type { Doc, Out2D } from "@/lib/types";

export function download(name: string, data: BlobPart, mime = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeName = (s: string) => s.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "stencil";

/** Floating bridges print best spray-face-down (bridges become first layers, no supports). */
export const defaultFlip = (doc: Doc) => doc.bridges.enabled && doc.bridges.kind === "floating";

export async function exportStl(doc: Doc, flip: boolean): Promise<Uint8Array> {
  return engine().exportStl(doc, flip);
}

export async function export3mf(doc: Doc, result: Out2D, flip: boolean, title: string): Promise<Uint8Array> {
  const m = await engine().computeMesh(doc);
  if (!m) throw new Error("Engine busy, try again.");
  const H = result.bounds[3] - result.bounds[1];
  let T = 0;
  for (let i = 2; i < m.positions.length; i += 3) T = Math.max(T, m.positions[i]);
  const v: string[] = new Array(m.positions.length / 3);
  for (let i = 0; i < v.length; i++) {
    let x = m.positions[i * 3];
    let y = m.positions[i * 3 + 1];
    let z = m.positions[i * 3 + 2];
    if (flip) {
      y = H - y;
      z = T - z;
    }
    v[i] = `<vertex x="${+x.toFixed(4)}" y="${+y.toFixed(4)}" z="${+z.toFixed(4)}"/>`;
    x = y = z = 0;
  }
  const t: string[] = new Array(m.indices.length / 3);
  for (let i = 0; i < t.length; i++) t[i] = `<triangle v1="${m.indices[i * 3]}" v2="${m.indices[i * 3 + 1]}" v3="${m.indices[i * 3 + 2]}"/>`;
  const esc = (s: string) => s.replace(/[<>&"]/g, "");
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc(title)}</metadata><metadata name="Application">StencilForge</metadata>` +
    `<resources><object id="1" name="${esc(title)}" type="model"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object></resources>` +
    `<build><item objectid="1"/></build></model>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    "3D/3dmodel.model": strToU8(model),
  });
}

/** 2D cut file: the outline of every solid region, in millimetres (y flipped for SVG). */
export function exportSvg(result: Out2D, includeBridges = true): string {
  const [x0, y0, x1, y1] = result.bounds;
  const w = x1 - x0;
  const h = y1 - y0;
  const body = `<path d="${result.material}" fill="none" stroke="#ff0000" stroke-width="0.1" fill-rule="evenodd"/>`;
  const bridges = includeBridges && result.bridgesClassic ? `<path d="${result.bridgesClassic}" fill="none" stroke="#0000ff" stroke-width="0.1"/>` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}">` +
    `<g transform="matrix(1 0 0 -1 ${(-x0).toFixed(3)} ${y1.toFixed(3)})">${body}${bridges}</g></svg>`
  );
}
