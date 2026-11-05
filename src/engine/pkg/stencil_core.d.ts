/* tslint:disable */
/* eslint-disable */
export interface Arc {
    /**
     * Radius of the baseline circle in mm.
     */
    radius?: number;
    /**
     * Text on the inside of the circle (reads along the bottom).
     */
    inside?: boolean;
    /**
     * Angle (deg) of the text\'s centre. 90 = top of the circle.
     */
    centerAngle?: number;
}

export interface Axis {
    tag?: string;
    value?: number;
}

export interface AxisInfo {
    tag: string;
    min: number;
    default: number;
    max: number;
}

export interface BridgeOut {
    a: [number, number];
    b: [number, number];
    width: number;
    kind: BridgeKind;
    manual: boolean;
    manualId: string | undefined;
}

export interface Bridges {
    enabled?: boolean;
    kind?: BridgeKind;
    width?: number;
    minPerIsland?: number;
    strategy?: Strategy;
    /**
     * Degrees; used by `Angle`.
     */
    angle?: number;
    /**
     * Height of a floating bridge in mm (sits at the top of the slab).
     */
    floatHeight?: number;
    maxLength?: number;
    manual?: ManualBridge[];
    /**
     * Automatic bridges whose endpoints are near any of these points are dropped.
     */
    suppressed?: [number, number][];
}

export interface Doc {
    mode?: Mode;
    mirror?: boolean;
    thickness?: number;
    objects?: Obj[];
    slab?: Slab;
    bridges?: Bridges;
    edge?: Edge;
    print?: Print;
}

export interface Edge {
    /**
     * Widen the cut towards the spray side by this many mm (0 = straight walls).
     */
    chamfer?: number;
    steps?: number;
}

export interface FontInfo {
    family: string;
    glyphCount: number;
    axes: AxisInfo[];
}

export interface IslandOut {
    path: string;
    anchored: boolean;
    area: number;
}

export interface Issue {
    /**
     * \"error\" | \"warning\" | \"info\
     */
    severity: string;
    code: string;
    message: string;
    path: string | undefined;
}

export interface ManualBridge {
    id?: string;
    a?: [number, number];
    b?: [number, number];
    width?: number | undefined;
    kind?: BridgeKind | undefined;
}

export interface Margins {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}

export interface Obj {
    id?: string;
    visible?: boolean;
    x?: number;
    y?: number;
    /**
     * Degrees, counter-clockwise.
     */
    rotation?: number;
    scale?: number;
    content?: Content;
}

export interface Out2D {
    bounds: [number, number, number, number];
    slab: string;
    material: string;
    open: string;
    bridgesClassic: string;
    bridgesFloating: string;
    islands: IslandOut[];
    bridges: BridgeOut[];
    issues: Issue[];
    stats: Stats;
}

export interface Print {
    minWall?: number;
    layerHeight?: number;
    /**
     * Material density in g/cm3 (PLA 1.24).
     */
    density?: number;
}

export interface Slab {
    shape?: SlabShape;
    /**
     * Fit the slab around the content using `margins`; otherwise use `width` x `height`.
     */
    fit?: boolean;
    width?: number;
    height?: number;
    margins?: Margins;
    /**
     * Corner radius / chamfer size.
     */
    radius?: number;
    /**
     * Positive mode only: width of the surrounding frame (0 = none).
     */
    frame?: number;
    mountHoles?: boolean;
    holeDiameter?: number;
    holeInset?: number;
}

export interface Stats {
    islands: number;
    bridges: number;
    width: number;
    height: number;
    materialArea: number;
    volumeMm3: number;
    grams: number;
}

export interface TextObj {
    text?: string;
    font?: string;
    /**
     * Em size in mm.
     */
    size?: number;
    tracking?: number;
    /**
     * Line pitch as a multiple of the em size.
     */
    leading?: number;
    align?: Align;
    kerning?: boolean;
    /**
     * Thicken (+) or thin (-) every glyph by this many mm per side.
     */
    weight?: number;
    variations?: Axis[];
    arc?: Arc | undefined;
}

export type Align = "left" | "center" | "right";

export type BridgeKind = "classic" | "floating";

export type Content = { type: "text" } & TextObj;

export type Mode = "negative" | "positive";

export type SlabShape = "rect" | "rounded" | "chamfer" | "ellipse" | "pill" | "contour";

export type Strategy = "shortest" | "angle" | "axis" | "radial";


export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    compute2d(doc: Doc): Out2D;
    computeMesh(doc: Doc): MeshData;
    /**
     * Binary STL. `flip` rotates the part so the spray face lies on the print bed.
     */
    exportStl(doc: Doc, flip: boolean): Uint8Array;
    hasFont(id: string): boolean;
    /**
     * Register a font under `id`. Returns metadata, including variable axes.
     */
    loadFont(id: string, data: Uint8Array): FontInfo;
    constructor();
}

/**
 * Triangle mesh handed to the viewer (positions in mm).
 */
export class MeshData {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly badEdges: number;
    readonly indices: Uint32Array;
    readonly openEdges: number;
    readonly positions: Float32Array;
    readonly volume: number;
}

export function start(): void;

export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly __wbg_meshdata_free: (a: number, b: number) => void;
    readonly engine_compute2d: (a: number, b: any) => [number, number, number];
    readonly engine_computeMesh: (a: number, b: any) => [number, number, number];
    readonly engine_exportStl: (a: number, b: any, c: number) => [number, number, number, number];
    readonly engine_hasFont: (a: number, b: number, c: number) => number;
    readonly engine_loadFont: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly engine_new: () => number;
    readonly meshdata_badEdges: (a: number) => number;
    readonly meshdata_indices: (a: number) => [number, number];
    readonly meshdata_openEdges: (a: number) => number;
    readonly meshdata_positions: (a: number) => [number, number];
    readonly meshdata_volume: (a: number) => number;
    readonly start: () => void;
    readonly version: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
