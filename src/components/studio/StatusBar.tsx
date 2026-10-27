"use client";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const result = useStudio((s) => s.result);
  const computing = useStudio((s) => s.computing);
  const error = useStudio((s) => s.error);
  const units = useStudio((s) => s.units);
  const mesh = useStudio((s) => s.mesh);
  const s = result?.stats;
  const issues = result?.issues ?? [];
  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warning").length;
  const L = (mm: number) => (units === "in" ? `${(mm / 25.4).toFixed(2)}″` : `${mm.toFixed(1)} mm`);

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-ink-700 bg-ink-850/90 px-4 font-mono text-[11px] text-ink-200">
      <span className="flex items-center gap-1.5">
        {computing ? (
          <>
            <Loader2 className="size-3 animate-spin text-volt-400" /> Computing
          </>
        ) : error ? (
          <>
            <XCircle className="size-3 text-danger" /> Error
          </>
        ) : (
          <>
            <span className="size-1.5 rounded-full bg-ok shadow-[0_0_8px_var(--color-ok)]" /> Ready
          </>
        )}
      </span>
      {s && (
        <>
          <span>
            {L(s.width)} × {L(s.height)}
          </span>
          <span className="hidden sm:inline">{s.islands} islands</span>
          <span className="hidden sm:inline">{s.bridges} bridges</span>
          <span className="hidden md:inline">≈ {s.grams.toFixed(1)} g</span>
        </>
      )}
      {mesh && mesh.openEdges + mesh.badEdges === 0 && <span className="hidden text-ok lg:inline">watertight mesh</span>}

      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            className={cn(
              "ml-auto flex items-center gap-2 rounded px-2 py-0.5 transition hover:bg-ink-600",
              errors ? "text-danger" : warns ? "text-[#ffbe3c]" : "text-ok",
            )}
          >
            {errors ? <XCircle className="size-3.5" /> : warns ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            {errors ? `${errors} error${errors > 1 ? "s" : ""}` : warns ? `${warns} warning${warns > 1 ? "s" : ""}` : "Print-ready"}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="top" align="end" sideOffset={8} className="glass z-50 w-80 rounded-xl p-2 font-sans shadow-2xl animate-fade-up">
            {issues.length === 0 && <p className="p-3 text-[12.5px] text-ink-200">No problems found. Every island is anchored and all walls are thick enough.</p>}
            {issues.map((i, k) => (
              <div key={k} className="flex gap-2.5 rounded-lg p-2.5 text-[12.5px] leading-snug text-ink-50">
                {i.severity === "error" ? (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                ) : i.severity === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#ffbe3c]" />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-volt-400" />
                )}
                {i.message}
              </div>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </footer>
  );
}
