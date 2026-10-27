// Bundled fonts (all SIL OFL). Files live in /public/fonts.
export interface FontEntry {
  id: string;
  name: string;
  file: string;
  category: "stencil" | "display" | "sans" | "serif" | "script" | "mono";
  variable?: boolean;
  /** Short note shown in the picker. */
  note?: string;
}

export const BUNDLED_FONTS: FontEntry[] = [
  { id: "allerta-stencil", name: "Allerta Stencil", file: "AllertaStencil-Regular.ttf", category: "stencil", note: "Classic military stencil" },
  { id: "stardos-stencil", name: "Stardos Stencil", file: "StardosStencil-Bold.ttf", category: "stencil", note: "Serif stencil" },
  { id: "saira-stencil", name: "Saira Stencil One", file: "SairaStencilOne-Regular.ttf", category: "stencil", note: "Squared, modern" },
  { id: "big-shoulders-stencil", name: "Big Shoulders Stencil", file: "BigShouldersStencilDisplay-Variable.ttf", category: "stencil", variable: true, note: "Condensed, variable weight" },
  { id: "black-ops-one", name: "Black Ops One", file: "BlackOpsOne-Regular.ttf", category: "display", note: "Heavy, stencil-style" },
  { id: "bebas-neue", name: "Bebas Neue", file: "BebasNeue-Regular.ttf", category: "sans" },
  { id: "anton", name: "Anton", file: "Anton-Regular.ttf", category: "sans" },
  { id: "archivo-black", name: "Archivo Black", file: "ArchivoBlack-Regular.ttf", category: "sans" },
  { id: "oswald", name: "Oswald", file: "Oswald-Variable.ttf", category: "sans", variable: true },
  { id: "inter", name: "Inter", file: "Inter-Variable.ttf", category: "sans", variable: true },
  { id: "space-grotesk", name: "Space Grotesk", file: "SpaceGrotesk-Variable.ttf", category: "sans", variable: true },
  { id: "bungee", name: "Bungee", file: "Bungee-Regular.ttf", category: "display" },
  { id: "rubik-mono-one", name: "Rubik Mono One", file: "RubikMonoOne-Regular.ttf", category: "display" },
  { id: "playfair", name: "Playfair Display", file: "PlayfairDisplay-Variable.ttf", category: "serif", variable: true },
  { id: "pacifico", name: "Pacifico", file: "Pacifico-Regular.ttf", category: "script" },
  { id: "permanent-marker", name: "Permanent Marker", file: "PermanentMarker-Regular.ttf", category: "script" },
  { id: "jetbrains-mono", name: "JetBrains Mono", file: "JetBrainsMono-Variable.ttf", category: "mono", variable: true },
];

export const fontById = (id: string) => BUNDLED_FONTS.find((f) => f.id === id);
