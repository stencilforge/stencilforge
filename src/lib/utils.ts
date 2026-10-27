import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Tiny safe expression parser: numbers, + - * / ( ) and unit suffixes (mm, cm, in, "). Returns mm. */
export function parseLength(input: string, defaultUnit: "mm" | "in" = "mm"): number | null {
  const src = input.trim().toLowerCase().replace(/,/g, ".");
  if (!src) return null;
  const toMm: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, '"': 25.4, ft: 304.8 };
  const fallback = defaultUnit === "in" ? 25.4 : 1;
  let i = 0;
  const ws = () => {
    while (src[i] === " ") i++;
  };
  function number(): number | null {
    ws();
    const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    let v = parseFloat(m[0]);
    ws();
    const u = /^(mm|cm|ft|in|m|")/.exec(src.slice(i));
    if (u) {
      i += u[0].length;
      v *= toMm[u[0]];
    } else {
      v *= fallback;
    }
    return v;
  }
  function factor(): number | null {
    ws();
    if (src[i] === "-") {
      i++;
      const f = factor();
      return f === null ? null : -f;
    }
    if (src[i] === "(") {
      i++;
      const e = expr();
      ws();
      if (src[i] !== ")") return null;
      i++;
      return e;
    }
    return number();
  }
  function term(): number | null {
    let l = factor();
    while (l !== null) {
      ws();
      const op = src[i];
      if (op !== "*" && op !== "/") break;
      i++;
      // bare multipliers/divisors are unitless, so undo the unit fallback scale
      const save = i;
      const r = factor();
      if (r === null) return null;
      void save;
      l = op === "*" ? l * (r / fallback) : l / (r / fallback);
    }
    return l;
  }
  function expr(): number | null {
    let l = term();
    while (l !== null) {
      ws();
      const op = src[i];
      if (op !== "+" && op !== "-") break;
      i++;
      const r = term();
      if (r === null) return null;
      l = op === "+" ? l + r : l - r;
    }
    return l;
  }
  const v = expr();
  ws();
  return v !== null && i === src.length && Number.isFinite(v) ? v : null;
}
