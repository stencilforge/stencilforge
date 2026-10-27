"use client";
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn, clamp, parseLength } from "@/lib/utils";
import { useStudio } from "@/lib/store";

/* ---------------------------------------------------------------- Tooltip */
export function Tip({ label, children, side = "bottom", kbd }: { label: string; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; kbd?: string }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            className="z-[100] flex items-center gap-2 rounded-md border border-ink-500 bg-ink-700 px-2 py-1 text-[11px] text-ink-50 shadow-xl animate-fade-up"
          >
            {label}
            {kbd && <kbd className="rounded bg-ink-500 px-1 font-mono text-[10px] text-ink-100">{kbd}</kbd>}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/* ------------------------------------------------------------------ Button */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: "ember" | "volt" | "plain" }
>(function IconButton({ className, active, tone = "plain", ...p }, ref) {
  return (
    <button
      ref={ref}
      {...p}
      className={cn(
        "grid size-8 place-items-center rounded-md text-ink-100 transition",
        "hover:bg-ink-600 hover:text-ink-50 disabled:pointer-events-none disabled:opacity-30",
        active && tone === "volt" && "bg-volt-500/15 text-volt-300 shadow-[inset_0_0_0_1px_rgb(46_139_255/0.45)]",
        active && tone === "ember" && "bg-ember-500/15 text-ember-300 shadow-[inset_0_0_0_1px_rgb(255_107_26/0.45)]",
        active && tone === "plain" && "bg-ink-600 text-ink-50",
        className,
      )}
    />
  );
});

export function Button({
  variant = "ghost",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline" | "volt" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-[12.5px] font-medium transition disabled:pointer-events-none disabled:opacity-40",
        variant === "primary" &&
          "bg-gradient-to-b from-ember-400 to-ember-600 text-ink-950 shadow-[0_0_0_1px_rgb(255_107_26/0.6),0_6px_20px_-6px_rgb(255_107_26/0.7)] hover:from-ember-300 hover:to-ember-500",
        variant === "volt" && "bg-volt-500 text-white hover:bg-volt-400 shadow-[0_6px_20px_-8px_rgb(46_139_255/0.8)]",
        variant === "outline" && "border border-ink-500 bg-ink-750 text-ink-50 hover:border-ink-300 hover:bg-ink-700",
        variant === "ghost" && "text-ink-100 hover:bg-ink-600 hover:text-ink-50",
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------- Field */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <label className="flex min-w-0 shrink-0 flex-col text-[11.5px] leading-tight text-ink-200">
        <span>{label}</span>
        {hint && <span className="text-[10px] text-ink-300">{hint}</span>}
      </label>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ NumberField */
interface NumberFieldProps {
  value: number;
  onChange: (v: number) => void;
  /** "mm" values are shown in the user's chosen unit system. */
  unit?: "mm" | "deg" | "x" | "g" | "";
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  className?: string;
  label?: string;
}

export function NumberField({ value, onChange, unit = "", step = 1, min = -Infinity, max = Infinity, precision = 2, className, label }: NumberFieldProps) {
  const units = useStudio((s) => s.units);
  const isLen = unit === "mm";
  const factor = isLen && units === "in" ? 1 / 25.4 : 1;
  const suffix = isLen ? units : unit === "deg" ? "°" : unit === "x" ? "×" : unit;
  const prec = isLen && units === "in" ? Math.max(precision, 3) : precision;
  const shown = (v: number) => String(+(v * factor).toFixed(prec));
  const [text, setText] = React.useState("");
  const [focus, setFocus] = React.useState(false);

  const commit = (raw: string) => {
    let v: number | null;
    if (isLen) v = parseLength(raw, units);
    else {
      const n = parseFloat(raw.replace(",", "."));
      v = Number.isFinite(n) ? n : null;
    }
    if (v !== null) onChange(clamp(v, min, max));
    else setText(shown(value));
  };

  // drag the label to scrub the value
  const drag = React.useRef<{ x: number; v: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, v: value };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const mult = e.shiftKey ? 0.1 : e.altKey ? 10 : 1;
    const next = drag.current.v + dx * step * 0.25 * mult;
    const q = Math.round(next / (step / 20)) * (step / 20);
    onChange(clamp(+q.toFixed(4), min, max));
  };
  const onPointerUp = () => (drag.current = null);

  return (
    <div
      className={cn(
        "group flex h-7 w-[104px] items-center rounded-md border border-ink-500 bg-ink-850 text-[12px] transition focus-within:border-volt-500 focus-within:shadow-[0_0_0_3px_rgb(46_139_255/0.18)] hover:border-ink-400",
        className,
      )}
    >
      {label && (
        <span
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="grid h-full w-6 shrink-0 cursor-ew-resize place-items-center border-r border-ink-600 font-mono text-[10px] text-ink-300 select-none hover:text-ember-400"
        >
          {label}
        </span>
      )}
      <input
        value={focus ? text : shown(value)}
        inputMode="decimal"
        onFocus={(e) => {
          setFocus(true);
          setText(shown(value));
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocus(false);
          commit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(shown(value));
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            onChange(clamp(+(value + d).toFixed(4), min, max));
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono tabular-nums text-ink-50 outline-none"
      />
      {suffix && <span className="pr-2 font-mono text-[10px] text-ink-300 select-none">{suffix}</span>}
    </div>
  );
}

/* --------------------------------------------------------------- Segmented */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  tone = "ember",
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  tone?: "ember" | "volt";
  className?: string;
}) {
  const id = React.useId();
  return (
    <div className={cn("relative inline-flex rounded-md border border-ink-500 bg-ink-850 p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-10 flex h-6 min-w-8 items-center justify-center gap-1.5 rounded px-2.5 text-[11.5px] font-medium transition-colors",
              on ? "text-ink-50" : "text-ink-200 hover:text-ink-50",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
                className={cn(
                  "absolute inset-0 -z-10 rounded",
                  tone === "ember"
                    ? "bg-ember-500/20 shadow-[inset_0_0_0_1px_rgb(255_107_26/0.55)]"
                    : "bg-volt-500/20 shadow-[inset_0_0_0_1px_rgb(46_139_255/0.55)]",
                )}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Switch */
export function Switch({ checked, onChange, tone = "ember" }: { checked: boolean; onChange: (v: boolean) => void; tone?: "ember" | "volt" }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full border border-ink-500 bg-ink-700 transition",
        checked && (tone === "ember" ? "border-ember-500 bg-ember-500/80" : "border-volt-500 bg-volt-500/80"),
      )}
    >
      <SwitchPrimitive.Thumb className="block size-3 translate-x-[2px] rounded-full bg-ink-50 shadow transition-transform data-[state=checked]:translate-x-[16px]" />
    </SwitchPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Slider */
export function Slider({ value, onChange, min, max, step = 0.1 }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <SliderPrimitive.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0])}
      className="relative flex h-5 w-full touch-none items-center select-none"
    >
      <SliderPrimitive.Track className="relative h-1 grow rounded-full bg-ink-600">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-volt-600 to-volt-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-3.5 rounded-full border-2 border-volt-400 bg-ink-50 shadow-[0_0_12px_rgb(46_139_255/0.6)] outline-none transition hover:scale-110" />
    </SliderPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Select */
export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 w-full appearance-none rounded-md border border-ink-500 bg-ink-850 pl-2 pr-7 text-[12px] text-ink-50 outline-none transition hover:border-ink-400 focus:border-volt-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-ink-800">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-300" />
    </div>
  );
}

/* ----------------------------------------------------------------- Section */
export function Section({
  title,
  icon,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="border-b border-ink-700/80">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.08em] text-ink-100 uppercase transition hover:bg-ink-750"
      >
        {icon && <span className="text-ink-300">{icon}</span>}
        <span className="flex-1">{title}</span>
        {badge}
        <ChevronDown className={cn("size-3.5 text-ink-300 transition-transform", !open && "-rotate-90")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 px-4 pt-1 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "ember" | "volt" | "danger" | "ok" }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded px-1.5 font-mono text-[10px] normal-case tracking-normal",
        tone === "plain" && "bg-ink-600 text-ink-100",
        tone === "ember" && "bg-ember-500/20 text-ember-300",
        tone === "volt" && "bg-volt-500/20 text-volt-300",
        tone === "danger" && "bg-danger/20 text-danger",
        tone === "ok" && "bg-ok/15 text-ok",
      )}
    >
      {children}
    </span>
  );
}
