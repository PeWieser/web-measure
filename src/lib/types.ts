export interface Pt {
  x: number;
  y: number;
}

export type UnitId = "mm" | "cm" | "m" | "inch" | "foot" | "px";

export const UNITS: { id: UnitId; label: string; mmPerUnit: number }[] = [
  { id: "mm", label: "mm", mmPerUnit: 1 },
  { id: "cm", label: "cm", mmPerUnit: 10 },
  { id: "m", label: "m", mmPerUnit: 1000 },
  { id: "inch", label: "inch", mmPerUnit: 25.4 },
  { id: "foot", label: "ft", mmPerUnit: 304.8 },
  { id: "px", label: "px", mmPerUnit: 0 },
];

export function unitMm(id: UnitId): number {
  return UNITS.find((u) => u.id === id)?.mmPerUnit ?? 0;
}

export type Tool =
  | "select"
  | "pan"
  | "calib2"
  | "calib4"
  | "line"
  | "polyline"
  | "polygon"
  | "rect"
  | "ellipse"
  | "circle"
  | "angle"
  | "lineangle"
  | "lot"
  | "parallel"
  | "marker"
  | "text"
  | "arrow";

export type MeasureType = Exclude<Tool, "select" | "pan" | "calib2" | "calib4">;

export const TYPE_LABEL: Record<MeasureType, string> = {
  line: "Strecke",
  polyline: "Polylinie",
  polygon: "Polygon",
  rect: "Rechteck",
  ellipse: "Ellipse",
  circle: "Kreis (3 Punkte)",
  angle: "Winkel",
  lineangle: "Schnittwinkel",
  lot: "Lot (Punkt → Linie)",
  parallel: "Parallelenabstand",
  marker: "Marker",
  text: "Text",
  arrow: "Pfeil",
};

export interface Calibration {
  id: string;
  name: string;
  kind: "reference" | "perspective";
  /** Zwei-Punkt-Referenz: bekannte Distanz zwischen a und b */
  ref?: { a: Pt; b: Pt; distance: number; unit: UnitId };
  /** Perspektive: 4 Eckpunkte im Originalbild, optional reale Breite/Höhe der Ebene */
  persp?: {
    pts: [Pt, Pt, Pt, Pt];
    realW?: number;
    realH?: number;
    unit: UnitId;
    /** 8 Parameter (h33=1), kartiert Entzerrungsraum → Originalbild */
    homography: number[];
  };
}

export interface Measurement {
  id: string;
  type: MeasureType;
  name: string;
  color: string;
  visible: boolean;
  points: Pt[];
  text?: string;
  /** Textgröße in Bildschirmpixeln */
  size?: number;
}

export interface Adjustments {
  brightness: number; // 0..200, 100 = neutral
  contrast: number; // 0..200, 100 = neutral
  saturate: number; // 0..200, 100 = neutral
  gamma: number; // 0.3..3, 1 = neutral (WBS-Rechenpfad)
  sharpen: number; // 0..100
}

export const DEFAULT_ADJ: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  gamma: 1,
  sharpen: 0,
};

export interface CountConfig {
  threshold: number; // 0..255
  invert: boolean;
  minArea: number; // in Bilddpixel²
}

export interface CountItem {
  x: number;
  y: number;
  r: number;
  area: number; // Bilddpixel²
}

export interface CountResult {
  count: number;
  totalAreaPx: number;
  avgAreaPx: number;
  maxAreaPx: number;
  items: CountItem[];
  k: number; // Analyse-Skalierung
  at: number; // Zeitstempel
}

export interface PendingCalib {
  kind: "reference" | "perspective";
  points: Pt[];
}

export const MEASURE_COLORS = [
  "#FFC24B",
  "#45C4E9",
  "#62D26F",
  "#E5484D",
  "#D666D6",
  "#F2F4F8",
];

export function nextColor(existing: Measurement[]): string {
  const used = existing.map((m) => m.color);
  return MEASURE_COLORS.find((c) => !used.includes(c)) || MEASURE_COLORS[existing.length % MEASURE_COLORS.length];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
