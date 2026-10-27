// Builds the Rust geometry engine to WASM and drops it into src/engine/pkg.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dev = process.argv.includes("--dev");
const args = [
  "build",
  path.join(root, "crates/stencil-core"),
  "--target", "web",
  "--out-dir", path.join(root, "src/engine/pkg"),
  "--out-name", "stencil_core",
  dev ? "--dev" : "--release",
];
const r = spawnSync("wasm-pack", args, { stdio: "inherit", cwd: root });
if (r.status === 0) {
  // Serve the binary as a plain static asset so every bundler/runtime can fetch it.
  const dest = path.join(root, "public/wasm");
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(root, "src/engine/pkg/stencil_core_bg.wasm"), path.join(dest, "stencil_core_bg.wasm"));
}
process.exit(r.status ?? 1);
