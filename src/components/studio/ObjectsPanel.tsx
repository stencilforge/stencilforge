"use client";
import { Copy, Eye, EyeOff, Plus, Trash2, Type } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useStudio, objectLabel } from "@/lib/store";
import { IconButton, Tip } from "@/components/ui/controls";
import { cn } from "@/lib/utils";

export function ObjectsPanel() {
  const objects = useStudio((s) => s.doc.objects);
  const selectedId = useStudio((s) => s.selectedId);
  const select = useStudio((s) => s.select);
  const addText = useStudio((s) => s.addText);
  const duplicate = useStudio((s) => s.duplicateObj);
  const update = useStudio((s) => s.updateObj);
  const remove = useStudio((s) => s.removeObj);
  const last = objects.length < 2;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-100 uppercase">Objects</span>
        <Tip label="Add text" side="right">
          <IconButton onClick={addText} className="size-7 text-ember-400 hover:text-ember-300">
            <Plus className="size-4" />
          </IconButton>
        </Tip>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-3">
        <AnimatePresence initial={false}>
          {objects.map((o) => {
            const label = objectLabel(o);
            const on = o.id === selectedId;
            return (
              <motion.div
                key={o.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                onClick={() => select(o.id)}
                className={cn(
                  "group flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition",
                  on ? "border-volt-500/50 bg-volt-500/10" : "border-transparent hover:bg-ink-700",
                )}
              >
                <span className={cn("grid size-7 place-items-center rounded-md", on ? "bg-volt-500/20 text-volt-300" : "bg-ink-700 text-ink-200")}>
                  <Type className="size-3.5" />
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", !o.visible && "text-ink-300 line-through")}>{label}</span>
                <span className="flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                  <Tip label="Duplicate" side="top">
                    <IconButton
                      className="size-6"
                      aria-label="Duplicate"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicate(o.id);
                      }}
                    >
                      <Copy className="size-3" />
                    </IconButton>
                  </Tip>
                  <Tip label={o.visible ? "Hide" : "Show"} side="top">
                    <IconButton
                      className="size-6"
                      aria-label={o.visible ? "Hide" : "Show"}
                      onClick={(e) => {
                        e.stopPropagation();
                        update(o.id, (x) => void (x.visible = !x.visible));
                      }}
                    >
                      {o.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                    </IconButton>
                  </Tip>
                  <Tip label={last ? "A design needs at least one object. Use New design to start over" : "Delete"} side="top">
                    <span>
                      <IconButton
                        className="size-6 hover:text-danger"
                        aria-label="Delete"
                        disabled={last}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(o.id);
                        }}
                      >
                        <Trash2 className="size-3" />
                      </IconButton>
                    </span>
                  </Tip>
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
