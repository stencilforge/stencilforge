"use client";
import dynamic from "next/dynamic";

// The studio relies on Web Workers, WASM and WebGL, so it only runs in the browser.
const Studio = dynamic(() => import("@/components/studio/Studio").then((m) => m.Studio), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center">
      <span className="animate-pulse-soft font-mono text-xs tracking-[0.3em] text-ink-300 uppercase">Loading studio</span>
    </div>
  ),
});

export default function StudioPage() {
  return <Studio />;
}
