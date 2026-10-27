"use client";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { Box, Download, LayoutPanelLeft, PenTool, Plus, Redo2, Ruler, Sparkles, Undo2 } from "lucide-react";
import { useStudio, undo, redo } from "@/lib/store";
import { PRESETS } from "@/lib/presets";

export function CommandPalette() {
  const open = useStudio((s) => s.paletteOpen);
  const setOpen = useStudio((s) => s.setPalette);
  const st = useStudio.getState;
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-ink-100 aria-selected:bg-ember-500/15 aria-selected:text-ink-50";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-[18vh] left-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 outline-none">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command className="glass overflow-hidden rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]" loop>
            <Command.Input
              autoFocus
              placeholder="Type a command or search templates…"
              className="h-12 w-full border-b border-ink-600 bg-transparent px-4 text-[14px] text-ink-50 outline-none placeholder:text-ink-300"
            />
            <Command.List className="max-h-[360px] overflow-y-auto p-2">
              <Command.Empty className="p-6 text-center text-sm text-ink-300">Nothing found.</Command.Empty>
              <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-300 [&_[cmdk-group-heading]]:uppercase">
                <Command.Item className={item} onSelect={run(() => st().addText())}>
                  <Plus className="size-4 text-ember-400" /> Add text object
                </Command.Item>
                <Command.Item className={item} onSelect={run(() => st().setExport(true))}>
                  <Download className="size-4 text-ember-400" /> Export…
                </Command.Item>
                <Command.Item className={item} onSelect={run(undo)}>
                  <Undo2 className="size-4 text-ink-200" /> Undo
                </Command.Item>
                <Command.Item className={item} onSelect={run(redo)}>
                  <Redo2 className="size-4 text-ink-200" /> Redo
                </Command.Item>
                <Command.Item className={item} onSelect={run(() => st().setUnits(st().units === "mm" ? "in" : "mm"))}>
                  <Ruler className="size-4 text-ink-200" /> Toggle millimetres / inches
                </Command.Item>
              </Command.Group>
              <Command.Group heading="View" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-300 [&_[cmdk-group-heading]]:uppercase">
                <Command.Item className={item} onSelect={run(() => st().setView("design"))}>
                  <PenTool className="size-4 text-volt-400" /> Design view
                </Command.Item>
                <Command.Item className={item} onSelect={run(() => st().setView("split"))}>
                  <LayoutPanelLeft className="size-4 text-volt-400" /> Split view
                </Command.Item>
                <Command.Item className={item} onSelect={run(() => st().setView("3d"))}>
                  <Box className="size-4 text-volt-400" /> 3D preview
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Templates" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-300 [&_[cmdk-group-heading]]:uppercase">
                {PRESETS.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`template ${p.name} ${p.desc}`}
                    className={item}
                    onSelect={run(() => {
                      st().replaceDoc(p.build());
                    })}
                  >
                    <Sparkles className="size-4 text-ember-400" />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-[11px] text-ink-300">{p.desc}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
