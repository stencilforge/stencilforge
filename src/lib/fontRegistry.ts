"use client";
import { engine } from "@/engine/client";
import { BUNDLED_FONTS, fontById } from "@/lib/fonts";
import { useStudio } from "@/lib/store";

const bytesCache = new Map<string, Uint8Array>();
const inflight = new Map<string, Promise<void>>();

/** CSS family name used to preview a font in the UI. */
export const previewFamily = (id: string) => `sf-${id}`;

function registerPreview(id: string, bytes: Uint8Array) {
  try {
    const face = new FontFace(previewFamily(id), bytes.slice().buffer as ArrayBuffer);
    face.load().then((f) => document.fonts.add(f)).catch(() => {});
  } catch {
    /* preview font unavailable (e.g. unsupported format) */
  }
}

/** Make sure a font is loaded into the engine (and registered for UI previews). */
export function ensureFont(id: string): Promise<void> {
  const st = useStudio.getState();
  if (st.fonts[id]?.status === "ready") return Promise.resolve();
  const existing = inflight.get(id);
  if (existing) return existing;

  const p = (async () => {
    const entry = fontById(id);
    const name = entry?.name ?? id;
    useStudio.getState().setFont(id, { status: "loading", name });
    try {
      let bytes = bytesCache.get(id);
      if (!bytes) {
        if (!entry) throw new Error(`Unknown font "${id}"`);
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/fonts/${entry.file}`);
        if (!res.ok) throw new Error(`Could not download ${entry.file}`);
        bytes = new Uint8Array(await res.arrayBuffer());
        bytesCache.set(id, bytes);
      }
      const info = await engine().loadFont(id, bytes.slice());
      registerPreview(id, bytes);
      useStudio.getState().setFont(id, { status: "ready", info, name: info.family || name });
    } catch (e) {
      useStudio.getState().setFont(id, { status: "error", name, error: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}

/** Register a user-supplied TTF/OTF. Returns the new font id. */
export async function addCustomFont(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = `custom-${file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const info = await engine().loadFont(id, bytes.slice());
  bytesCache.set(id, bytes);
  registerPreview(id, bytes);
  useStudio.getState().setFont(id, { status: "ready", info, name: info.family || file.name });
  return id;
}

/** Preload the default font set lazily in the background (small, cached by the browser). */
export function preloadCommonFonts() {
  for (const f of BUNDLED_FONTS.slice(0, 4)) ensureFont(f.id).catch(() => {});
}
