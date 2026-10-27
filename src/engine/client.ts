import type { Doc, FontInfo, Out2D } from "@/lib/types";

export interface MeshResult {
  positions: Float32Array;
  indices: Uint32Array;
  openEdges: number;
  badEdges: number;
  volume: number;
}

type Pending = { resolve: (v: never) => void; reject: (e: Error) => void };
type Slot = { busy: boolean; next?: { args: unknown[]; resolve: (v: never) => void; reject: (e: Error) => void } };

/** Thin RPC wrapper around the engine worker. Compute calls are coalesced: only the newest request of
 *  each kind runs after the in-flight one finishes, and superseded callers receive `null`. */
export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private slots = new Map<string, Slot>();

  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (ev: MessageEvent) => {
      const { id, ok, result, error } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (ok) p.resolve(result as never);
      else p.reject(new Error(error));
    };
    this.worker.onerror = (ev) => {
      const err = new Error(ev.message || "engine worker crashed");
      this.pending.forEach((p) => p.reject(err));
      this.pending.clear();
    };
  }

  private call<T>(method: string, args: unknown[], transfer: Transferable[] = []): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as never, reject });
      this.worker.postMessage({ id, method, args }, transfer);
    });
  }

  private latest<T>(method: string, args: unknown[]): Promise<T | null> {
    let slot = this.slots.get(method);
    if (!slot) this.slots.set(method, (slot = { busy: false }));
    const s = slot;
    if (s.busy) {
      s.next?.resolve(null as never);
      return new Promise<T | null>((resolve, reject) => {
        s.next = { args, resolve: resolve as never, reject };
      });
    }
    s.busy = true;
    return this.call<T>(method, args).finally(() => {
      s.busy = false;
      const n = s.next;
      s.next = undefined;
      if (n) this.latest<T>(method, n.args).then(n.resolve as never, n.reject);
    });
  }

  loadFont(id: string, bytes: Uint8Array): Promise<FontInfo> {
    return this.call("loadFont", [id, bytes]);
  }
  compute2d(doc: Doc): Promise<Out2D | null> {
    return this.latest("compute2d", [doc]);
  }
  computeMesh(doc: Doc): Promise<MeshResult | null> {
    return this.latest("computeMesh", [doc]);
  }
  exportStl(doc: Doc, flip: boolean): Promise<Uint8Array> {
    return this.call("exportStl", [doc, flip]);
  }
  terminate() {
    this.worker.terminate();
  }
}

let singleton: EngineClient | null = null;
export function engine(): EngineClient {
  if (!singleton) singleton = new EngineClient();
  return singleton;
}
