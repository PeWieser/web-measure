import { create } from "zustand";

let bitmap: ImageBitmap | null = null;
let warped: HTMLCanvasElement | null = null;
let edgesOverlay: HTMLCanvasElement | null = null;

export function setBitmap(b: ImageBitmap | null) {
  bitmap = b;
}
export function getBitmap() {
  return bitmap;
}
export function setWarped(w: HTMLCanvasElement | null) {
  warped = w;
}
export function getWarped() {
  return warped;
}
export function setEdgesOverlay(e: HTMLCanvasElement | null) {
  edgesOverlay = e;
}
export function getEdgesOverlay() {
  return edgesOverlay;
}

let analysis: { canvas: HTMLCanvasElement; k: number } | null = null;
export function setAnalysis(a: { canvas: HTMLCanvasElement; k: number } | null) {
  analysis = a;
}
export function getAnalysis() {
  return analysis;
}

export type ViewCmd =
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "fit" }
  | { type: "oneOne" };

let cmdHandler: ((c: ViewCmd) => void) | null = null;
export function onViewCmd(fn: (c: ViewCmd) => void) {
  cmdHandler = fn;
  return () => {
    if (cmdHandler === fn) cmdHandler = null;
  };
}
export function sendCmd(c: ViewCmd) {
  cmdHandler?.(c);
}

interface SaveState {
  state: "idle" | "saving" | "saved" | "error";
  set: (s: SaveState["state"]) => void;
}
export const useSave = create<SaveState>((set) => ({ state: "idle", set: (s) => set({ state: s }) }));
