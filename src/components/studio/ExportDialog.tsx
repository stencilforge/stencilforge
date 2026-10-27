"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Box, FileJson, FileType2, Loader2, PencilRuler, X, Download, Check, Info } from "lucide-react";
import { motion } from "motion/react";
import { useStudio } from "@/lib/store";
import { Button, Switch } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { defaultFlip, download, export3mf, exportStl, exportSvg, safeName } from "@/lib/export";

type Fmt = "stl" | "3mf" | "svg" | "json";

const FORMATS: { id: Fmt; name: string; desc: string; icon: React.ReactNode; ext: string }[] = [
  { id: "stl", name: "STL", desc: "Universal 3D-print mesh", icon: <Box className="size-5" />, ext: ".stl" },
  { id: "3mf", name: "3MF", desc: "Modern format, keeps units", icon: <FileType2 className="size-5" />, ext: ".3mf" },
  { id: "svg", name: "SVG", desc: "2D cut paths for laser / vinyl", icon: <PencilRuler className="size-5" />, ext: ".svg" },
  { id: "json", name: "Project", desc: "Editable StencilForge file", icon: <FileJson className="size-5" />, ext: ".stencil.json" },
];

export function ExportDialog() {
  const open = useStudio((s) => s.exportOpen);
  const setOpen = useStudio((s) => s.setExport);
  const doc = useStudio((s) => s.doc);
  const result = useStudio((s) => s.result);
  const [fmt, setFmt] = React.useState<Fmt>("stl");
  const [flipOverride, setFlipOverride] = React.useState<boolean | null>(null);
  const flip = flipOverride ?? defaultFlip(doc);
  const setFlip = (v: boolean) => setFlipOverride(v);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const first = doc.objects[0]?.content;
  const baseName = safeName(first && first.type === "text" ? first.text.split("\n")[0].slice(0, 24) : "stencil");

  const onOpenChange = (o: boolean) => {
    if (!o) {
      setFlipOverride(null);
      setDone(false);
      setErr(null);
    }
    setOpen(o);
  };

  const run = async () => {
    if (!result) return;
    setBusy(true);
    setErr(null);
    try {
      const f = FORMATS.find((x) => x.id === fmt)!;
      const name = `${baseName}${f.ext}`;
      if (fmt === "stl") download(name, (await exportStl(doc, flip)) as BlobPart, "model/stl");
      else if (fmt === "3mf") download(name, (await export3mf(doc, result, flip, baseName)) as BlobPart, "model/3mf");
      else if (fmt === "svg") download(name, exportSvg(result), "image/svg+xml");
      else download(name, JSON.stringify(doc, null, 2), "application/json");
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const is3d = fmt === "stl" || fmt === "3mf";
  const s = result?.stats;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-up" />
        <Dialog.Content className="glass fixed top-1/2 left-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] outline-none">
          <div className="flex items-start justify-between border-b border-ink-600 px-6 py-5">
            <div>
              <Dialog.Title className="text-[17px] font-semibold tracking-tight">Export</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12.5px] text-ink-200">Get your stencil ready for the printer or cutter.</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-ink-200 hover:bg-ink-600 hover:text-ink-50">
              <X className="size-4" />
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-2.5 p-6 pb-3">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFmt(f.id)}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl border p-3.5 text-left transition",
                  fmt === f.id ? "border-ember-500/70 bg-ember-500/10 shadow-[0_0_0_1px_rgb(255_107_26/0.3),0_8px_24px_-12px_rgb(255_107_26/0.5)]" : "border-ink-500 bg-ink-800 hover:border-ink-300",
                )}
              >
                <span className={cn("grid size-10 place-items-center rounded-lg", fmt === f.id ? "bg-ember-500/20 text-ember-300" : "bg-ink-700 text-ink-200")}>{f.icon}</span>
                <span>
                  <span className="block text-[13.5px] font-semibold">{f.name}</span>
                  <span className="block text-[11.5px] leading-tight text-ink-300">{f.desc}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 px-6 pb-5">
            {is3d && (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-600 bg-ink-850/70 p-3.5">
                <div>
                  <p className="text-[13px] font-medium">Print orientation: spray face down</p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink-300">
                    Flips the part so raised bridges become the first layers and need no supports. Recommended for floating bridges.
                  </p>
                </div>
                <Switch checked={flip} onChange={setFlip} />
              </div>
            )}
            {s && (
              <div className="grid grid-cols-4 gap-2 font-mono text-[11px]">
                {[
                  ["Size", `${s.width.toFixed(1)}×${s.height.toFixed(1)}`],
                  ["Thickness", `${doc.thickness} mm`],
                  ["Volume", `${(s.volumeMm3 / 1000).toFixed(1)} cm³`],
                  ["Filament", `~${s.grams.toFixed(1)} g`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-ink-850 px-2.5 py-2">
                    <div className="text-[9.5px] tracking-wider text-ink-300 uppercase">{k}</div>
                    <div className="mt-0.5 text-ink-50">{v}</div>
                  </div>
                ))}
              </div>
            )}
            {result?.issues.some((i) => i.severity === "error") && (
              <p className="flex items-start gap-2 rounded-lg bg-danger/10 p-3 text-[12px] text-danger">
                <Info className="mt-0.5 size-3.5 shrink-0" /> There are unresolved errors (disconnected islands). The export will still work, but those pieces would fall out.
              </p>
            )}
            {err && <p className="text-[12px] text-danger">{err}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-ink-600 px-6 py-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <motion.div whileTap={{ scale: 0.97 }}>
              <Button variant="primary" onClick={run} disabled={busy || !result} className="h-9 min-w-36 px-5">
                {busy ? <Loader2 className="size-4 animate-spin" /> : done ? <Check className="size-4" /> : <Download className="size-4" />}
                {done ? "Saved" : `Download ${FORMATS.find((f) => f.id === fmt)!.ext}`}
              </Button>
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
