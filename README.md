# StencilForge

Turn vector text into 3D-printable spray-paint stencils. Everything runs in the browser: a Rust geometry engine compiled to WebAssembly runs in a Web Worker, and a Next.js + Tailwind UI sits on top.

## Quick start

```bash
npm install
npm run wasm        # builds crates/stencil-core to src/engine/pkg (needs Rust + wasm-pack)
npm run dev         # http://localhost:3000  (landing page) and /studio
```

Requirements: Node 20+, Rust with the `wasm32-unknown-unknown` target, and `wasm-pack` (`cargo install wasm-pack`).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run wasm` | Release build of the Rust engine, copies the binary to `public/wasm/` |
| `npm run build` | WASM build + static export to `out/` |
| `npm test` | Vitest: unit tests and the WASM engine run in Node |
| `npm run test:rust` | Rust tests: topology, bridges, mesh watertightness over every bundled font |
| `npm run test:e2e` | Playwright: boots the studio, edits text, opens 3D, downloads an STL |

## How it works

1. **Layout** (`layout.rs`): text is shaped with rustybuzz (kerning, ligatures, variable axes), flattened to polylines at 0.01 mm tolerance, optionally wrapped on an arc.
2. **Regions** (`geom.rs`): `i_overlay` does the booleans and offsets. A stencil is `slab − letters`; its connected components are *islands*.
3. **Bridges** (`bridges.rs`): rays are cast from island boundaries across the gap. A Kruskal spanning tree anchors every island, then extra bridges are added, spread around the island, up to *min per island*. Strategies: shortest, axis, fixed angle, radial.
4. **Band stack** (`pipeline.rs`): the solid is a stack of z-bands. Classic bridges span all bands; floating bridges only occupy the top band; a spray-side chamfer is a staircase of progressively wider cuts.
5. **Mesher** (`mesh.rs`): integer micrometre geometry, caps from one shared overlay graph per pair of slabs, T-junction repair, and a manifold check used by the tests.
6. **Export**: binary STL (Rust), 3MF (TypeScript + fflate), SVG cut file and project JSON.

Floating bridges print best spray-face-down; the export dialog turns that orientation on automatically.

## Layout

```
crates/stencil-core/   Rust engine (cdylib → wasm)
src/engine/            worker + client + generated pkg/ (git-ignored)
src/lib/               store (zustand + undo), defaults, fonts, export, presets
src/components/        studio UI (viewports, inspector, dialogs) and ui primitives
public/fonts/          bundled SIL OFL fonts
```
