"use client";
import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronsUpDown, Search, Upload, Loader2, Check } from "lucide-react";
import { BUNDLED_FONTS, type FontEntry } from "@/lib/fonts";
import { addCustomFont, ensureFont, previewFamily } from "@/lib/fontRegistry";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

const CATS: { id: FontEntry["category"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "stencil", label: "Stencil" },
  { id: "sans", label: "Sans" },
  { id: "display", label: "Display" },
  { id: "serif", label: "Serif" },
  { id: "script", label: "Script" },
  { id: "mono", label: "Mono" },
];

export function FontPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const fonts = useStudio((s) => s.fonts);
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState<(typeof CATS)[number]["id"]>("all");
  const [err, setErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const customs = Object.entries(fonts)
    .filter(([id, f]) => id.startsWith("custom-") && f.status === "ready")
    .map(([id, f]) => ({ id, name: f.name, file: "", category: "display" as const }));
  const all: FontEntry[] = [...customs, ...BUNDLED_FONTS];
  const list = all.filter((f) => (cat === "all" || f.category === cat) && f.name.toLowerCase().includes(q.toLowerCase()));

  // load previews for the visible fonts when the popover opens
  React.useEffect(() => {
    if (!open) return;
    list.slice(0, 40).forEach((f) => ensureFont(f.id).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cat, q]);

  const current = all.find((f) => f.id === value);
  const pick = async (id: string) => {
    setErr(null);
    try {
      await ensureFont(id);
      onChange(id);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const upload = async (file: File) => {
    setErr(null);
    try {
      if (!/\.(ttf|otf)$/i.test(file.name)) throw new Error("Please choose a .ttf or .otf file.");
      const id = await addCustomFont(file);
      onChange(id);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-850 px-2.5 text-left transition hover:border-ink-400 data-[state=open]:border-volt-500">
          <span className="truncate text-[15px] text-ink-50" style={{ fontFamily: `${previewFamily(value)}, var(--font-sans)` }}>
            {current?.name ?? fonts[value]?.name ?? value}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-300" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="left"
          align="start"
          sideOffset={12}
          collisionPadding={12}
          className="glass z-50 flex max-h-[min(560px,80vh)] w-[340px] flex-col overflow-hidden rounded-xl shadow-2xl animate-fade-up"
        >
          <div className="flex items-center gap-2 border-b border-ink-600 px-3 py-2">
            <Search className="size-3.5 text-ink-300" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search fonts"
              className="h-6 flex-1 bg-transparent text-[13px] text-ink-50 outline-none placeholder:text-ink-300"
            />
          </div>
          <div className="flex flex-wrap gap-1 border-b border-ink-600 px-3 py-2">
            {CATS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] transition",
                  cat === c.id ? "bg-ember-500/20 text-ember-300 shadow-[inset_0_0_0_1px_rgb(255_107_26/0.5)]" : "text-ink-200 hover:bg-ink-600",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {list.map((f) => {
              const st = fonts[f.id]?.status;
              return (
                <button
                  key={f.id}
                  onClick={() => pick(f.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-ink-600",
                    f.id === value && "bg-volt-500/10",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[19px] leading-tight text-ink-50"
                      style={{ fontFamily: st === "ready" ? `${previewFamily(f.id)}, var(--font-sans)` : undefined }}
                    >
                      {f.name}
                    </span>
                    <span className="block text-[10.5px] text-ink-300">
                      {f.category}
                      {f.variable ? " · variable" : ""}
                      {f.note ? ` · ${f.note}` : ""}
                    </span>
                  </span>
                  {st === "loading" && <Loader2 className="size-3.5 animate-spin text-ink-300" />}
                  {f.id === value && <Check className="size-4 text-volt-400" />}
                </button>
              );
            })}
            {list.length === 0 && <p className="p-6 text-center text-xs text-ink-300">No fonts match.</p>}
          </div>
          <div className="border-t border-ink-600 p-2">
            {err && <p className="px-1 pb-2 text-[11.5px] text-danger">{err}</p>}
            <input ref={fileRef} type="file" accept=".ttf,.otf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-dashed border-ink-400 text-[12px] text-ink-100 transition hover:border-ember-500 hover:text-ember-300"
            >
              <Upload className="size-3.5" /> Upload your own font (.ttf / .otf)
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
