"use client";
import * as React from "react";
import { useStudio, undo, redo } from "@/lib/store";
import { useEngineSync } from "@/lib/useEngineSync";
import { preloadCommonFonts } from "@/lib/fontRegistry";
import { TopBar } from "./TopBar";
import { ObjectsPanel } from "./ObjectsPanel";
import { Inspector } from "./Inspector";
import { Viewport2D } from "./Viewport2D";
import { Viewport3D } from "./Viewport3D";
import { StatusBar } from "./StatusBar";
import { ExportDialog } from "./ExportDialog";
import { CommandPalette } from "./CommandPalette";
import { Toast } from "./Toast";
import { PRESETS } from "@/lib/presets";
import { Sparkles } from "lucide-react";

export function Studio() {
  useEngineSync();
  const view = useStudio((s) => s.view);

  React.useEffect(() => {
    preloadCommonFonts();
    if (process.env.NODE_ENV !== "production") (window as unknown as { __studio: typeof useStudio }).__studio = useStudio;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = !!(e.target as HTMLElement).closest("input,textarea,select,[contenteditable]");
      const st = useStudio.getState();
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        st.setPalette(!st.paletteOpen);
      } else if (mod && e.key.toLowerCase() === "e") {
        e.preventDefault();
        st.setExport(true);
      } else if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        redo();
      } else if (!mod && !typing && !e.defaultPrevented && (e.key === "Delete" || e.key === "Backspace")) {
        // (the 2D viewport claims the key first when a bridge is selected)
        if (st.selectedId && st.doc.objects.length > 1) {
          e.preventDefault();
          st.removeObj(st.selectedId);
        }
      } else if (!mod && !typing && ["1", "2", "3"].includes(e.key)) {
        st.setView(e.key === "1" ? "design" : e.key === "2" ? "split" : "3d");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[232px] shrink-0 flex-col border-r border-ink-700 bg-ink-850/80 lg:flex">
          <div className="min-h-0 flex-1">
            <ObjectsPanel />
          </div>
          <Templates />
        </aside>

        <main className="dot-grid relative flex min-w-0 flex-1">
          {(view === "design" || view === "split") && (
            <div className="relative min-w-0 flex-1">
              <Viewport2D />
            </div>
          )}
          {view === "split" && <div className="w-px shrink-0 bg-ink-600" />}
          {(view === "3d" || view === "split") && (
            <div className="relative min-w-0 flex-1">
              <Viewport3D />
            </div>
          )}
        </main>

        <aside className="w-[340px] shrink-0 border-l border-ink-700 bg-ink-850/80">
          <Inspector />
        </aside>
      </div>
      <StatusBar />
      <ExportDialog />
      <CommandPalette />
      <Toast />
    </div>
  );
}

function Templates() {
  const replace = useStudio((s) => s.replaceDoc);
  return (
    <div className="border-t border-ink-700 p-3">
      <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-ink-300 uppercase">
        <Sparkles className="size-3 text-ember-400" /> Templates
      </div>
      <div className="grid grid-cols-1 gap-1">
        {PRESETS.slice(0, 5).map((p) => (
          <button
            key={p.id}
            onClick={() => replace(p.build())}
            className="rounded-md px-2.5 py-1.5 text-left text-[12px] text-ink-100 transition hover:bg-ink-700 hover:text-ink-50"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
