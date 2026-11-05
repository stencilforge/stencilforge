"use client";
import { Box, Command, Download, FilePlus2, LayoutPanelLeft, Redo2, Ruler, Undo2, PenTool } from "lucide-react";
import { useStore } from "zustand";
import { useStudio, undo, redo } from "@/lib/store";
import { Button, IconButton, Segmented, Tip } from "@/components/ui/controls";
import { LogoMark } from "./Logo";
import Link from "next/link";

export function TopBar() {
  const view = useStudio((s) => s.view);
  const setView = useStudio((s) => s.setView);
  const units = useStudio((s) => s.units);
  const setUnits = useStudio((s) => s.setUnits);
  const setPalette = useStudio((s) => s.setPalette);
  const setExport = useStudio((s) => s.setExport);
  const newDoc = useStudio((s) => s.newDoc);
  const canUndo = useStore(useStudio.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useStudio.temporal, (s) => s.futureStates.length > 0);

  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-850/90 px-3 backdrop-blur">
      <Link href="/" className="flex items-center gap-2.5 pr-2">
        <LogoMark />
        <span className="text-[14px] font-semibold tracking-tight">
          Stencil<span className="text-gradient-ember">Forge</span>
        </span>
      </Link>

      <div className="mx-1 h-5 w-px bg-ink-600" />
      <div className="flex items-center">
        <Tip label="New design (undo to get it back)">
          <IconButton aria-label="New design" onClick={newDoc}>
            <FilePlus2 className="size-4" />
          </IconButton>
        </Tip>
        <Tip label="Undo" kbd="⌘Z">
          <IconButton disabled={!canUndo} onClick={undo}>
            <Undo2 className="size-4" />
          </IconButton>
        </Tip>
        <Tip label="Redo" kbd="⇧⌘Z">
          <IconButton disabled={!canRedo} onClick={redo}>
            <Redo2 className="size-4" />
          </IconButton>
        </Tip>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <Segmented
          tone="volt"
          value={view}
          onChange={setView}
          options={[
            { value: "design", label: <><PenTool className="size-3.5" /> Design</>, title: "2D design view (1)" },
            { value: "split", label: <><LayoutPanelLeft className="size-3.5" /> Split</>, title: "Side by side (2)" },
            { value: "3d", label: <><Box className="size-3.5" /> 3D</>, title: "3D preview (3)" },
          ]}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Tip label="Display units">
          <button
            onClick={() => setUnits(units === "mm" ? "in" : "mm")}
            className="flex h-7 items-center gap-1.5 rounded-md border border-ink-500 px-2 font-mono text-[11px] text-ink-100 transition hover:border-ink-300"
          >
            <Ruler className="size-3.5 text-ink-300" />
            {units}
          </button>
        </Tip>
        <Tip label="Command palette" kbd="⌘K">
          <button
            onClick={() => setPalette(true)}
            className="hidden h-7 items-center gap-2 rounded-md border border-ink-500 px-2 text-[11.5px] text-ink-200 transition hover:border-ink-300 sm:flex"
          >
            <Command className="size-3.5" /> Search…
            <kbd className="rounded bg-ink-600 px-1 font-mono text-[10px]">⌘K</kbd>
          </button>
        </Tip>
        <Button variant="primary" onClick={() => setExport(true)} className="h-8 px-4">
          <Download className="size-3.5" /> Export
        </Button>
      </div>
    </header>
  );
}
