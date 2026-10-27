/// <reference lib="webworker" />
// Runs the Rust/WASM geometry engine off the main thread.
import init, { Engine } from "./pkg/stencil_core";

type Req = { id: number; method: string; args: unknown[] };

let engine: Engine | null = null;
const ready = (async () => {
  await init({ module_or_path: new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/wasm/stencil_core_bg.wasm`, self.location.origin) });
  engine = new Engine();
})();

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, method, args } = ev.data;
  try {
    await ready;
    const e = engine!;
    switch (method) {
      case "loadFont": {
        const [fontId, bytes] = args as [string, Uint8Array];
        ctx.postMessage({ id, ok: true, result: e.loadFont(fontId, bytes) });
        break;
      }
      case "hasFont":
        ctx.postMessage({ id, ok: true, result: e.hasFont(args[0] as string) });
        break;
      case "compute2d":
        ctx.postMessage({ id, ok: true, result: e.compute2d(args[0] as never) });
        break;
      case "computeMesh": {
        const m = e.computeMesh(args[0] as never);
        const positions = m.positions;
        const indices = m.indices;
        const result = { positions, indices, openEdges: m.openEdges, badEdges: m.badEdges, volume: m.volume };
        m.free();
        ctx.postMessage({ id, ok: true, result }, [positions.buffer, indices.buffer]);
        break;
      }
      case "exportStl": {
        const bytes = e.exportStl(args[0] as never, args[1] as boolean);
        ctx.postMessage({ id, ok: true, result: bytes }, [bytes.buffer]);
        break;
      }
      default:
        throw new Error(`unknown method ${method}`);
    }
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
