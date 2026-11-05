"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStudio, undo } from "@/lib/store";

const DURATION_MS = 5000;

/** Bottom-centre message with an Undo button. Restarts its timer whenever a new toast arrives. */
export function Toast() {
  const toast = useStudio((s) => s.toast);
  const dismiss = useStudio((s) => s.dismissToast);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, DURATION_MS);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[90] flex justify-center">
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="glass pointer-events-auto flex items-center gap-3 rounded-xl border border-ink-500 py-1.5 pr-1.5 pl-4 text-[12.5px] text-ink-50 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8)]"
          >
            <span>{toast.message}</span>
            <button
              onClick={() => {
                undo();
                dismiss();
              }}
              className="h-7 rounded-md bg-ember-500/15 px-3 font-medium text-ember-300 transition hover:bg-ember-500/25"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
