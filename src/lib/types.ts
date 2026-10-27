// Document types are generated from the Rust model (src/engine/pkg/stencil_core.d.ts).
// The Rust side marks every field optional (serde defaults); the app always holds a complete doc.
import type { Doc as RawDoc, Obj as RawObj, Content as RawContent, TextObj as RawTextObj } from "@/engine/pkg/stencil_core";

export type DeepRequired<T> = T extends (infer U)[]
  ? DeepRequired<U>[]
  : T extends [number, number]
    ? T
    : T extends object
      ? { [K in keyof T]-?: K extends "arc" ? DeepRequired<NonNullable<T[K]>> | null : DeepRequired<NonNullable<T[K]>> }
      : T;

export type Doc = DeepRequired<RawDoc>;
export type Obj = DeepRequired<RawObj>;
export type Content = DeepRequired<RawContent>;
export type TextObj = DeepRequired<RawTextObj>;

export type {
  Out2D,
  FontInfo,
  AxisInfo,
  Issue,
  IslandOut,
  BridgeOut,
  Stats,
  Mode,
  Align,
  SlabShape,
  BridgeKind,
  Strategy,
} from "@/engine/pkg/stencil_core";
