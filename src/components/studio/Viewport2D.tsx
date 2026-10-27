"use client";
import * as React from "react";
import { Layers, Maximize, Minus, Plus, Eye, EyeOff, MousePointer2, Anchor, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useStudio, bridgeKey, type LayerVis } from "@/lib/store";
import type { BridgeOut } from "@/lib/types";
import { IconButton, Tip } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

interface Cam {
  tx: number;
  ty: number;
  s: number;
}

const GRID_STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function Viewport2D({ className }: { className?: string }) {
  const result = useStudio((s) => s.result);
  const layers = useStudio((s) => s.layers);
  const units = useStudio((s) => s.units);
  const error = useStudio((s) => s.error);
  const computing = useStudio((s) => s.computing);
  const toggleLayer = useStudio((s) => s.toggleLayer);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const selectedBridge = useStudio((s) => s.selectedBridge);
  const selectBridge = useStudio((s) => s.selectBridge);
  const addManualBridge = useStudio((s) => s.addManualBridge);
  const removeBridge = useStudio((s) => s.removeBridge);
  const updateBridge = useStudio((s) => s.updateBridge);
  const [draft, setDraft] = React.useState<{ a: [number, number]; b: [number, number] } | null>(null);

  const box = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 800, h: 600 });
  const [cam, setCam] = React.useState<Cam>({ tx: 0, ty: 0, s: 3 });
  const [panning, setPanning] = React.useState(false);
  const [layersOpen, setLayersOpen] = React.useState(false);
  const fitted = React.useRef(false);
  const touched = React.useRef(false);
  const camRef = React.useRef(cam);
  React.useEffect(() => {
    camRef.current = cam;
  }, [cam]);

  const bounds = result?.bounds;
  const selectedBr = result?.bridges.find((b) => bridgeKey(b) === selectedBridge) ?? null;

  const fit = React.useCallback(
    (w = size.w, h = size.h) => {
      if (!bounds) return;
      const bw = Math.max(bounds[2] - bounds[0], 1);
      const bh = Math.max(bounds[3] - bounds[1], 1);
      const pad = 90;
      const s = Math.max(0.05, Math.min((w - pad * 2) / bw, (h - pad * 2) / bh));
      touched.current = false;
      setCam({ s, tx: w / 2 - ((bounds[0] + bounds[2]) / 2) * s, ty: h / 2 + ((bounds[1] + bounds[3]) / 2) * s });
    },
    [bounds, size.w, size.h],
  );

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: width, h: height });
      if ((!fitted.current || !touched.current) && bounds && width > 0) {
        fit(width, height);
        fitted.current = true;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bounds, fit]);

  // fit the first time a result appears
  React.useEffect(() => {
    if (bounds && !fitted.current && size.w > 0) {
      fit();
      fitted.current = true;
    }
  }, [bounds, fit, size.w]);

  // wheel zoom around the cursor
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const c = camRef.current;
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        const s = Math.min(400, Math.max(0.05, c.s * k));
        const kk = s / c.s;
        setCam({ s, tx: mx - (mx - c.tx) * kk, ty: my - (my - c.ty) * kk });
      } else {
        setCam({ ...c, tx: c.tx - e.deltaX, ty: c.ty - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const drag = React.useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const toWorld = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    const c = camRef.current;
    return [(e.clientX - r.left - c.tx) / c.s, (c.ty - (e.clientY - r.top)) / c.s];
  };
  const hitBridge = (p: [number, number]): BridgeOut | null => {
    if (!result) return null;
    const tol = Math.max(6 / camRef.current.s, 0);
    let best: { b: BridgeOut; d: number } | null = null;
    for (const b of result.bridges) {
      const [ax, ay] = b.a;
      const dx = b.b[0] - ax;
      const dy = b.b[1] - ay;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2));
      const d = Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy));
      if (d <= b.width / 2 + tol && (!best || d < best.d)) best = { b, d };
    }
    return best?.b ?? null;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 0 && tool === "bridge") {
      const p = toWorld(e);
      setDraft({ a: p, b: p });
      return;
    }
    if (e.button === 0 && tool === "select") {
      const hit = hitBridge(toWorld(e));
      if (hit) {
        selectBridge(bridgeKey(hit));
        return;
      }
      selectBridge(null);
    }
    drag.current = { x: e.clientX, y: e.clientY, tx: cam.tx, ty: cam.ty };
    touched.current = true;
    setPanning(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draft) {
      setDraft({ a: draft.a, b: toWorld(e) });
      return;
    }
    const d = drag.current;
    if (!d) return;
    setCam((c) => ({ ...c, tx: d.tx + e.clientX - d.x, ty: d.ty + e.clientY - d.y }));
  };
  const onPointerUp = () => {
    if (draft) {
      if (Math.hypot(draft.b[0] - draft.a[0], draft.b[1] - draft.a[1]) > 0.5) addManualBridge(draft.a, draft.b);
      setDraft(null);
      setTool("select");
    }
    drag.current = null;
    setPanning(false);
  };

  const zoomBy = (k: number) => {
    touched.current = true;
    const c = camRef.current;
    const mx = size.w / 2;
    const my = size.h / 2;
    const s = Math.min(400, Math.max(0.05, c.s * k));
    const kk = s / c.s;
    setCam({ s, tx: mx - (mx - c.tx) * kk, ty: my - (my - c.ty) * kk });
  };

  // keyboard: F = fit
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable]")) return;
      if (e.metaKey || e.ctrlKey) return;
      const st = useStudio.getState();
      if (e.key === "f") fit();
      else if (e.key === "v") st.setTool("select");
      else if (e.key === "b") st.setTool("bridge");
      else if (e.key === "Escape") {
        st.setTool("select");
        st.selectBridge(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selectedBridge) {
        const br = st.result?.bridges.find((x) => bridgeKey(x) === st.selectedBridge);
        if (br) st.removeBridge(br);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit]);

  const step = GRID_STEPS.find((g) => g * cam.s >= 16) ?? 1000;
  const { s, tx, ty } = cam;
  // visible world rect for the grid
  const wx0 = -tx / s;
  const wx1 = (size.w - tx) / s;
  const wy1 = ty / s;
  const wy0 = (ty - size.h) / s;
  const px = 1 / s;

  const fmt = (mm: number) => (units === "in" ? `${(mm / 25.4).toFixed(2)}″` : `${mm.toFixed(mm >= 100 ? 0 : 1)} mm`);
  const toScreen = (x: number, y: number) => [tx + x * s, ty - y * s] as const;

  return (
    <div
      ref={box}
      className={cn("relative h-full w-full overflow-hidden select-none", tool === "bridge" ? "cursor-crosshair" : panning ? "cursor-grabbing" : "cursor-grab", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => fit()}
    >
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <defs>
          <pattern id="dots" width={step} height={step} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={px * 1.1} fill="rgb(255 255 255 / 0.16)" />
          </pattern>
          <pattern id="dots-major" width={step * 5} height={step * 5} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={px * 1.8} fill="rgb(255 255 255 / 0.28)" />
          </pattern>
          <pattern id="hatch-ember" width={px * 7} height={px * 7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={px * 7} height={px * 7} fill="rgb(255 107 26 / 0.28)" />
            <line x1={0} y1={0} x2={0} y2={px * 7} stroke="#ff6b1a" strokeWidth={px * 3} />
          </pattern>
          <pattern id="hatch-danger" width={px * 6} height={px * 6} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width={px * 6} height={px * 6} fill="rgb(255 77 94 / 0.25)" />
            <line x1={0} y1={0} x2={0} y2={px * 6} stroke="#ff4d5e" strokeWidth={px * 2.2} />
          </pattern>
          <linearGradient id="mat" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#7e8693" />
            <stop offset="1" stopColor="#a9b0bb" />
          </linearGradient>
        </defs>

        {layers.grid && (
          <g>
            <g transform={`matrix(${s} 0 0 ${-s} ${tx} ${ty})`}>
              <rect x={wx0} y={wy0} width={wx1 - wx0} height={wy1 - wy0} fill="url(#dots)" />
              <rect x={wx0} y={wy0} width={wx1 - wx0} height={wy1 - wy0} fill="url(#dots-major)" />
            </g>
          </g>
        )}

        {result && (
          <g transform={`matrix(${s} 0 0 ${-s} ${tx} ${ty})`}>
            {/* soft shadow */}
            <path d={result.slab} transform={`translate(${px * 2} ${-px * 6})`} fill="rgb(0 0 0 / 0.45)" style={{ filter: "blur(6px)" }} />
            {layers.material && (
              <path d={result.material} fill="url(#mat)" fillRule="evenodd" stroke="rgb(255 255 255 / 0.55)" strokeWidth={px * 1} strokeLinejoin="round" />
            )}
            {layers.open && (
              <path d={result.open} fill="rgb(46 139 255 / 0.07)" fillRule="evenodd" stroke="rgb(46 139 255 / 0.55)" strokeWidth={px * 1} strokeDasharray={`${px * 4} ${px * 3}`} />
            )}
            {layers.islands &&
              result.islands.map((isl, i) => (
                <path
                  key={i}
                  d={isl.path}
                  fillRule="evenodd"
                  fill={isl.anchored ? "rgb(46 139 255 / 0.38)" : "url(#hatch-danger)"}
                  stroke={isl.anchored ? "rgb(84 160 255 / 0.9)" : "#ff4d5e"}
                  strokeWidth={px * 1.2}
                />
              ))}
            {layers.bridges && (
              <>
                <path d={result.bridgesClassic} fill="#ff6b1a" stroke="#ffa36b" strokeWidth={px * 0.8} fillRule="nonzero" />
                <path d={result.bridgesFloating} fill="url(#hatch-ember)" stroke="#ff8742" strokeWidth={px * 1.2} strokeDasharray={`${px * 3} ${px * 2}`} />
              </>
            )}
            {layers.issues &&
              result.issues
                .filter((i) => i.path && i.code === "thin")
                .map((i, k) => <path key={k} d={i.path!} fill="rgb(255 190 60 / 0.9)" stroke="#ffbe3c" strokeWidth={px * 1.5} />)}
            {result.bridges
              .filter((b) => bridgeKey(b) === selectedBridge)
              .map((b) => (
                <g key="sel">
                  <line x1={b.a[0]} y1={b.a[1]} x2={b.b[0]} y2={b.b[1]} stroke="#54a0ff" strokeWidth={b.width + px * 6} strokeOpacity={0.35} strokeLinecap="round" />
                  <circle cx={b.a[0]} cy={b.a[1]} r={px * 4} fill="#54a0ff" />
                  <circle cx={b.b[0]} cy={b.b[1]} r={px * 4} fill="#54a0ff" />
                </g>
              ))}
            {draft && (
              <line x1={draft.a[0]} y1={draft.a[1]} x2={draft.b[0]} y2={draft.b[1]} stroke="#ff8742" strokeWidth={px * 2} strokeDasharray={`${px * 5} ${px * 4}`} />
            )}
          </g>
        )}

        {/* dimensions in screen space */}
        {result && layers.dims && bounds && <Dimensions bounds={bounds} toScreen={toScreen} fmt={fmt} />}
      </svg>

      {/* tool rail */}
      <div className="glass absolute top-4 left-4 flex flex-col gap-0.5 rounded-xl p-1 shadow-2xl" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Tip label="Select / pan" side="right" kbd="V">
          <IconButton active={tool === "select"} tone="volt" onClick={() => setTool("select")}>
            <MousePointer2 className="size-4" />
          </IconButton>
        </Tip>
        <Tip label="Add bridge: drag across a gap" side="right" kbd="B">
          <IconButton active={tool === "bridge"} tone="ember" onClick={() => setTool("bridge")}>
            <Anchor className="size-4" />
          </IconButton>
        </Tip>
      </div>
      {selectedBr && (() => {
        const [mx, my] = toScreen((selectedBr.a[0] + selectedBr.b[0]) / 2, (selectedBr.a[1] + selectedBr.b[1]) / 2);
        return (
          <div
            className="glass absolute z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl p-1.5 shadow-2xl"
            style={{ left: Math.min(Math.max(mx, 130), size.w - 130), top: Math.min(my + 28, size.h - 56) }}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <div className="flex rounded-md border border-ink-500 bg-ink-850 p-0.5 text-[11px]">
              {(["classic", "floating"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => updateBridge(selectedBr, { kind: k })}
                  className={cn("rounded px-2 py-1 capitalize", selectedBr.kind === k ? "bg-ember-500/25 text-ember-300" : "text-ink-200 hover:text-ink-50")}
                >
                  {k}
                </button>
              ))}
            </div>
            <IconButton className="size-7" onClick={() => updateBridge(selectedBr, { width: Math.max(0.4, +(selectedBr.width - 0.2).toFixed(2)) })}>
              <Minus className="size-3.5" />
            </IconButton>
            <span className="w-12 text-center font-mono text-[11px] tabular-nums">{selectedBr.width.toFixed(1)} mm</span>
            <IconButton className="size-7" onClick={() => updateBridge(selectedBr, { width: +(selectedBr.width + 0.2).toFixed(2) })}>
              <Plus className="size-3.5" />
            </IconButton>
            <div className="mx-0.5 h-4 w-px bg-ink-500" />
            <IconButton className="size-7 hover:text-danger" onClick={() => removeBridge(selectedBr)}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        );
      })()}

      {/* empty / error states */}
      {!result && !error && (
        <div className="absolute inset-0 grid place-items-center text-sm text-ink-300">
          <span className="animate-pulse-soft font-mono text-xs tracking-widest uppercase">Booting geometry engine…</span>
        </div>
      )}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass absolute top-4 left-1/2 max-w-md -translate-x-1/2 rounded-lg px-4 py-2.5 text-[12.5px] text-danger"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* floating view controls */}
      <div
        className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-xl p-1 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Tip label="Zoom out" side="top">
          <IconButton onClick={() => zoomBy(1 / 1.25)}>
            <Minus className="size-4" />
          </IconButton>
        </Tip>
        <span className="w-14 text-center font-mono text-[11px] text-ink-100 tabular-nums">{Math.round((cam.s / 3.78) * 100)}%</span>
        <Tip label="Zoom in" side="top">
          <IconButton onClick={() => zoomBy(1.25)}>
            <Plus className="size-4" />
          </IconButton>
        </Tip>
        <div className="mx-1 h-4 w-px bg-ink-500" />
        <Tip label="Fit to view" side="top" kbd="F">
          <IconButton onClick={() => fit()}>
            <Maximize className="size-4" />
          </IconButton>
        </Tip>
        <Tip label="Layers" side="top">
          <IconButton active={layersOpen} tone="volt" onClick={() => setLayersOpen((o) => !o)}>
            <Layers className="size-4" />
          </IconButton>
        </Tip>
      </div>

      <AnimatePresence>
        {layersOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="glass absolute bottom-[68px] left-1/2 w-52 -translate-x-1/2 rounded-xl p-2 shadow-2xl"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {(
              [
                ["material", "Stencil body", "#9aa2ad"],
                ["open", "Cut-outs", "#2e8bff"],
                ["islands", "Islands", "#54a0ff"],
                ["bridges", "Bridges", "#ff6b1a"],
                ["issues", "Print warnings", "#ffbe3c"],
                ["dims", "Dimensions", "#8a9099"],
                ["grid", "Grid", "#5a616c"],
              ] as [keyof LayerVis, string, string][]
            ).map(([k, label, color]) => (
              <button
                key={k}
                onClick={() => toggleLayer(k)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] text-ink-100 hover:bg-ink-600"
              >
                <span className="size-2.5 rounded-sm" style={{ background: color, opacity: layers[k] ? 1 : 0.25 }} />
                <span className={cn("flex-1 text-left", !layers[k] && "text-ink-300")}>{label}</span>
                {layers[k] ? <Eye className="size-3.5 text-ink-200" /> : <EyeOff className="size-3.5 text-ink-400" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {computing && (
        <div className="absolute top-3 right-3 flex items-center gap-2 rounded-full bg-ink-800/80 px-2.5 py-1 font-mono text-[10px] tracking-wider text-volt-300 uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-volt-400" />
          computing
        </div>
      )}
    </div>
  );
}

function Dimensions({
  bounds,
  toScreen,
  fmt,
}: {
  bounds: [number, number, number, number];
  toScreen: (x: number, y: number) => readonly [number, number];
  fmt: (mm: number) => string;
}) {
  const [x0, y0, x1, y1] = bounds;
  const [ax, ay] = toScreen(x0, y0);
  const [bx, by] = toScreen(x1, y0);
  const [cx, cy] = toScreen(x1, y1);
  const off = 22;
  const stroke = "rgb(138 144 153 / 0.8)";
  return (
    <g fontFamily="var(--font-mono)" fontSize={10.5} fill="#b6bcc5">
      {/* width */}
      <line x1={ax} y1={ay + off} x2={bx} y2={by + off} stroke={stroke} />
      <line x1={ax} y1={ay + off - 4} x2={ax} y2={ay + off + 4} stroke={stroke} />
      <line x1={bx} y1={by + off - 4} x2={bx} y2={by + off + 4} stroke={stroke} />
      <g transform={`translate(${(ax + bx) / 2} ${ay + off + 15})`}>
        <rect x={-34} y={-11} width={68} height={16} rx={4} fill="#111317" stroke="#2c3138" />
        <text textAnchor="middle" y={0.5}>
          {fmt(x1 - x0)}
        </text>
      </g>
      {/* height */}
      <line x1={bx + off} y1={by} x2={cx + off} y2={cy} stroke={stroke} />
      <line x1={bx + off - 4} y1={by} x2={bx + off + 4} y2={by} stroke={stroke} />
      <line x1={cx + off - 4} y1={cy} x2={cx + off + 4} y2={cy} stroke={stroke} />
      <g transform={`translate(${bx + off + 15} ${(by + cy) / 2})`}>
        <rect x={-30} y={-11} width={60} height={16} rx={4} fill="#111317" stroke="#2c3138" />
        <text textAnchor="middle" y={0.5}>
          {fmt(y1 - y0)}
        </text>
      </g>
    </g>
  );
}
