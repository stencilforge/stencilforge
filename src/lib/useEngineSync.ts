"use client";
import { useEffect } from "react";
import { engine } from "@/engine/client";
import { ensureFont } from "@/lib/fontRegistry";
import { loadSavedDoc, saveDoc, useStudio } from "@/lib/store";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Keeps the WASM engine results in sync with the document, and persists the document. */
export function useEngineSync() {
  const doc = useStudio((s) => s.doc);
  const view = useStudio((s) => s.view);

  // restore the last session once
  useEffect(() => {
    const saved = loadSavedDoc();
    if (saved) {
      useStudio.getState().replaceDoc(saved);
      useStudio.temporal.getState().clear();
    }
  }, []);

  // autosave
  useEffect(() => {
    const t = setTimeout(() => saveDoc(doc), 400);
    return () => clearTimeout(t);
  }, [doc]);

  // 2D computation
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const st = useStudio.getState();
      st.setComputing(true);
      try {
        const ids = [...new Set(doc.objects.filter((o) => o.visible && o.content.type === "text").map((o) => (o.content as { font: string }).font))];
        await Promise.all(ids.map((id) => ensureFont(id)));
        const r = await engine().compute2d(doc);
        if (r && alive) {
          st.setResult(r);
          st.setError(null);
          st.setComputing(false);
        }
      } catch (e) {
        if (alive) {
          st.setError(msg(e));
          st.setComputing(false);
        }
      }
    }, 50);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc]);

  // 3D mesh, only while a 3D view is visible
  useEffect(() => {
    if (view === "design") return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const m = await engine().computeMesh(doc);
        if (m && alive) useStudio.getState().setMesh(m);
      } catch (e) {
        if (alive) useStudio.getState().setError(msg(e));
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, view]);
}
