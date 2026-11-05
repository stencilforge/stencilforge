import Link from "next/link";
import { ArrowRight, Anchor, Box, Layers3, Printer, Scissors, Sparkles, Type, Zap } from "lucide-react";
import { LogoMark } from "@/components/studio/Logo";

const FEATURES = [
  { icon: Anchor, title: "Smart bridges", body: "Every island in A, B, O and 8 is anchored automatically. Pick shortest span, fixed angle, axis-aligned or radial placement." },
  { icon: Layers3, title: "Floating bridges", body: "Raised bridges let paint flow underneath, so letters look continuous. They print face-down with no supports." },
  { icon: Type, title: "Any font", body: "Bundled stencil faces, variable-font sliders, text on an arc, or drop in your own TTF / OTF." },
  { icon: Box, title: "Watertight meshes", body: "Exact integer geometry produces manifold STL and 3MF files that slice cleanly, every time." },
  { icon: Scissors, title: "Slab designer", body: "Rounded, chamfered, pill, ellipse or outline-hugging slabs with configurable borders and mounting holes." },
  { icon: Printer, title: "Print-aware", body: "Thin-wall warnings, filament estimates, spray-side chamfers and print orientation built in." },
];

export default function Home() {
  return (
    <div className="h-dvh overflow-y-auto">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="text-[15px] font-semibold tracking-tight">
            Stencil<span className="text-gradient-ember">Forge</span>
          </span>
        </div>
        <Link
          href="/studio"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-ink-500 bg-ink-800 px-4 text-[13px] font-medium transition hover:border-ember-500 hover:text-ember-300"
        >
          Open studio <ArrowRight className="size-3.5" />
        </Link>
      </nav>

      <header className="relative mx-auto max-w-6xl px-6 pt-16 pb-24 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] dot-grid opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800/80 px-3 py-1 font-mono text-[11px] tracking-wider text-ink-100 uppercase">
          <Sparkles className="size-3 text-ember-400" /> Rust + WebAssembly geometry engine
        </span>
        <h1 className="animate-fade-up mx-auto mt-7 max-w-4xl text-balance text-5xl leading-[1.04] font-semibold tracking-tight [animation-delay:80ms] sm:text-7xl">
          Spray-paint stencils,
          <br />
          <span className="text-gradient-ember">engineered</span> for your 3D printer.
        </h1>
        <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-200 [animation-delay:160ms]">
          Type text, pick a font, and get a print-ready stencil with perfectly placed bridges. Runs entirely in your browser. Nothing is uploaded.
        </p>
        <div className="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-3 [animation-delay:240ms]">
          <Link
            href="/studio"
            className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-gradient-to-b from-ember-400 to-ember-600 px-7 text-[15px] font-semibold text-ink-950 shadow-[0_0_0_1px_rgb(255_107_26/0.6),0_14px_40px_-10px_rgb(255_107_26/0.7)] transition hover:from-ember-300 hover:to-ember-500"
          >
            <Zap className="size-4" /> Start designing
          </Link>
          <a href="#features" className="inline-flex h-12 items-center rounded-xl border border-ink-500 px-6 text-[15px] text-ink-100 transition hover:border-ink-300">
            See features
          </a>
        </div>

        {/* hero artwork: a stencil slab with bridges */}
        <div className="animate-fade-up relative mx-auto mt-16 max-w-3xl [animation-delay:320ms]">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-ember-500/15 via-transparent to-volt-500/15 blur-2xl" />
          <div className="panel rounded-2xl p-3">
            <div className="dot-grid relative overflow-hidden rounded-xl border border-ink-700 bg-ink-900 px-6 py-12">
              {/* real engine output: "BRIDGE" in Archivo Black, 4 islands anchored by 7 bridges */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/hero-stencil.svg`}
                alt="The word BRIDGE as a stencil, with orange bridges anchoring the enclosed parts of B, R and D"
                className="mx-auto w-full max-w-xl"
              />
              <div className="absolute right-4 bottom-3 flex gap-2 font-mono text-[10px] text-ink-300">
                <span className="rounded bg-ink-700 px-1.5 py-0.5">279 × 73 mm</span>
                <span className="rounded bg-ember-500/20 px-1.5 py-0.5 text-ember-300">7 bridges</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="features" className="mx-auto max-w-6xl px-6 pb-28">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="panel group rounded-2xl p-6 transition hover:border-ink-400"
              style={{ animation: "fade-up .6s cubic-bezier(.16,1,.3,1) both", animationDelay: `${i * 70}ms` }}
            >
              <span className="mb-4 grid size-10 place-items-center rounded-xl bg-ink-700 text-ember-400 transition group-hover:bg-ember-500/15">
                <f.icon className="size-5" />
              </span>
              <h3 className="text-[16px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-200">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 text-center">
          <Link href="/studio" className="inline-flex items-center gap-2 text-[15px] text-ember-300 hover:text-ember-200">
            Open the studio <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
