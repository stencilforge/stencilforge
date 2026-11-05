"use client";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { temporal } from "zundo";
import { defaultDoc, defaultObj } from "@/lib/defaults";
import type { BridgeKind, BridgeOut, Doc, FontInfo, Obj, Out2D, TextObj } from "@/lib/types";
import type { MeshResult } from "@/engine/client";

export type ViewMode = "design" | "3d" | "split";
export type Units = "mm" | "in";
export type Tool = "select" | "bridge";

/** Stable identity for a bridge across recomputes. */
export const bridgeKey = (b: Pick<BridgeOut, "manual" | "manualId" | "a">) =>
  b.manual && b.manualId ? `m:${b.manualId}` : `a:${Math.round(b.a[0] * 50)},${Math.round(b.a[1] * 50)}`;

export interface LayerVis {
  material: boolean;
  open: boolean;
  bridges: boolean;
  islands: boolean;
  issues: boolean;
  grid: boolean;
  dims: boolean;
}

export interface FontState {
  status: "loading" | "ready" | "error";
  info?: FontInfo;
  name: string;
  error?: string;
}

interface StudioState {
  doc: Doc;
  selectedId: string | null;
  view: ViewMode;
  units: Units;
  layers: LayerVis;
  fonts: Record<string, FontState>;
  result: Out2D | null;
  mesh: MeshResult | null;
  computing: boolean;
  error: string | null;
  paletteOpen: boolean;
  exportOpen: boolean;
  tool: Tool;
  selectedBridge: string | null;
  /** Transient message with an Undo button; UI-only, never part of undo history. */
  toast: { id: number; message: string } | null;

  showToast: (message: string) => void;
  dismissToast: () => void;
  updateDoc: (fn: (d: Doc) => void) => void;
  replaceDoc: (d: Doc) => void;
  /** Start over from the default design (undoable). */
  newDoc: () => void;
  updateObj: (id: string, fn: (o: Obj) => void) => void;
  updateText: (id: string, patch: Partial<TextObj>) => void;
  addText: () => void;
  removeObj: (id: string) => void;
  duplicateObj: (id: string) => void;
  select: (id: string | null) => void;
  setView: (v: ViewMode) => void;
  setUnits: (u: Units) => void;
  toggleLayer: (k: keyof LayerVis) => void;
  setFont: (id: string, s: FontState) => void;
  setResult: (r: Out2D | null) => void;
  setMesh: (m: MeshResult | null) => void;
  setComputing: (b: boolean) => void;
  setError: (e: string | null) => void;
  setPalette: (b: boolean) => void;
  setExport: (b: boolean) => void;
  setTool: (t: Tool) => void;
  selectBridge: (k: string | null) => void;
  addManualBridge: (a: [number, number], b: [number, number]) => void;
  removeBridge: (b: BridgeOut) => void;
  updateBridge: (b: BridgeOut, patch: { width?: number; kind?: BridgeKind }) => void;
  clearManualBridges: () => void;
}

let counter = 1;
let toastCounter = 0;

// Rapid edits (slider drags, typing) collapse into one undo step. `burst` is the open window.
let burst: ReturnType<typeof setTimeout> | null = null;
const endBurst = () => {
  if (burst) clearTimeout(burst);
  burst = null;
};
/** Run a discrete action (add, delete, new design…) as its own undo step, never merged with neighbours. */
const discrete = (fn: () => void) => {
  endBurst();
  fn();
  endBurst();
};
const newId = () => `obj${Date.now().toString(36)}${counter++}`;

/** Short display name for an object (first line of its text). */
export const objectLabel = (o: Obj) => (o.content.type === "text" ? o.content.text.split("\n")[0] || "Empty text" : "Object");

export const useStudio = create<StudioState>()(
  temporal(
    immer<StudioState>((set) => ({
      doc: defaultDoc(),
      selectedId: "obj1",
      view: "design",
      units: "mm",
      layers: { material: true, open: true, bridges: true, islands: true, issues: true, grid: true, dims: true },
      fonts: {},
      result: null,
      mesh: null,
      computing: false,
      error: null,
      paletteOpen: false,
      exportOpen: false,
      tool: "select",
      selectedBridge: null,
      toast: null,

      showToast: (message) => set((s) => void (s.toast = { id: ++toastCounter, message })),
      dismissToast: () => set((s) => void (s.toast = null)),
      updateDoc: (fn) => set((s) => void fn(s.doc)),
      replaceDoc: (d) =>
        discrete(() =>
          set((s) => {
            s.doc = d;
            s.selectedId = d.objects[0]?.id ?? null;
          })),
      newDoc: () =>
        discrete(() =>
          set((s) => {
            s.doc = defaultDoc();
            s.selectedId = s.doc.objects[0]?.id ?? null;
            s.selectedBridge = null;
            s.tool = "select";
            s.toast = { id: ++toastCounter, message: "Started a new design" };
          })),
      updateObj: (id, fn) =>
        set((s) => {
          const o = s.doc.objects.find((x) => x.id === id);
          if (o) fn(o);
        }),
      updateText: (id, patch) =>
        set((s) => {
          const o = s.doc.objects.find((x) => x.id === id);
          if (o && o.content.type === "text") Object.assign(o.content, patch);
        }),
      addText: () =>
        discrete(() =>
          set((s) => {
            const o = defaultObj(newId());
            if (o.content.type === "text") {
              o.content.text = "TEXT";
              o.content.size = 30;
            }
            o.y = -((s.doc.objects.length) * 10);
            s.doc.objects.push(o);
            s.selectedId = o.id;
          })),
      removeObj: (id) =>
        discrete(() =>
          set((s) => {
            // a design always keeps at least one object (use newDoc to start over)
            const gone = s.doc.objects.find((o) => o.id === id);
            if (!gone || s.doc.objects.length < 2) return;
            s.doc.objects = s.doc.objects.filter((o) => o.id !== id);
            if (s.selectedId === id) s.selectedId = s.doc.objects[0]?.id ?? null;
            s.toast = { id: ++toastCounter, message: `Deleted “${objectLabel(gone)}”` };
          })),
      duplicateObj: (id) =>
        discrete(() =>
          set((s) => {
            const src = s.doc.objects.find((o) => o.id === id);
            if (!src) return;
            const copy = structuredClone(JSON.parse(JSON.stringify(src))) as Obj;
            copy.id = newId();
            copy.y -= 10;
            s.doc.objects.push(copy);
            s.selectedId = copy.id;
          })),
      select: (id) => set((s) => void (s.selectedId = id)),
      setView: (v) => set((s) => void (s.view = v)),
      setUnits: (u) => set((s) => void (s.units = u)),
      toggleLayer: (k) => set((s) => void (s.layers[k] = !s.layers[k])),
      setFont: (id, f) => set((s) => void (s.fonts[id] = f)),
      setResult: (r) => set((s) => void (s.result = r)),
      setMesh: (m) => set((s) => void (s.mesh = m)),
      setComputing: (b) => set((s) => void (s.computing = b)),
      setError: (e) => set((s) => void (s.error = e)),
      setPalette: (b) => set((s) => void (s.paletteOpen = b)),
      setExport: (b) => set((s) => void (s.exportOpen = b)),
      setTool: (t) => set((s) => void (s.tool = t)),
      selectBridge: (k) => set((s) => void (s.selectedBridge = k)),
      addManualBridge: (a, b) =>
        set((s) => {
          const id = `m${Date.now().toString(36)}${counter++}`;
          s.doc.bridges.manual.push({ id, a, b, width: s.doc.bridges.width, kind: s.doc.bridges.kind });
          s.selectedBridge = `m:${id}`;
        }),
      removeBridge: (br) =>
        set((s) => {
          if (br.manual && br.manualId) s.doc.bridges.manual = s.doc.bridges.manual.filter((m) => m.id !== br.manualId);
          else s.doc.bridges.suppressed.push(br.a);
          s.selectedBridge = null;
        }),
      updateBridge: (br, patch) =>
        set((s) => {
          if (br.manual && br.manualId) {
            const m = s.doc.bridges.manual.find((x) => x.id === br.manualId);
            if (m) Object.assign(m, patch);
          } else {
            // editing an automatic bridge pins it as a manual one
            const id = `m${Date.now().toString(36)}${counter++}`;
            s.doc.bridges.suppressed.push(br.a);
            s.doc.bridges.manual.push({ id, a: br.a, b: br.b, width: patch.width ?? br.width, kind: patch.kind ?? br.kind });
            s.selectedBridge = `m:${id}`;
          }
        }),
      clearManualBridges: () =>
        set((s) => {
          s.doc.bridges.manual = [];
          s.doc.bridges.suppressed = [];
          s.selectedBridge = null;
        }),
    })),
    {
      // Only the document is undoable, and rapid edits (slider drags) collapse into one step.
      partialize: (s) => ({ doc: s.doc }),
      equality: (a, b) => a.doc === b.doc,
      limit: 100,
      handleSet: (handleSet) => (past) => {
        if (!burst) (handleSet as (p: unknown) => void)(past);
        else clearTimeout(burst);
        burst = setTimeout(() => {
          burst = null;
        }, 450);
      },
    },
  ),
);

/** Selection isn't part of undo history, so after a step back/forward make sure it still points at an object. */
const keepSelectionValid = () => {
  const { doc, selectedId, select } = useStudio.getState();
  if (!doc.objects.some((o) => o.id === selectedId)) select(doc.objects[0]?.id ?? null);
};
export const undo = () => {
  useStudio.temporal.getState().undo();
  keepSelectionValid();
};
export const redo = () => {
  useStudio.temporal.getState().redo();
  keepSelectionValid();
};

// --- persistence ---------------------------------------------------------------------------
const KEY = "stencilforge:doc:v1";
export function loadSavedDoc(): Doc | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Doc;
    if (!d || !Array.isArray(d.objects)) return null;
    // merge over defaults so older saves gain new fields
    return deepMerge(defaultDoc(), d);
  } catch {
    return null;
  }
}
export function saveDoc(d: Doc) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable */
  }
}

function deepMerge<T>(base: T, over: unknown): T {
  if (Array.isArray(base) || Array.isArray(over)) return (over ?? base) as T;
  if (base && typeof base === "object" && over && typeof over === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
      out[k] = k in out ? deepMerge(out[k], v) : v;
    }
    return out as T;
  }
  return (over ?? base) as T;
}
