import type { Pt, UnitId, Measurement, Calibration } from "./types";
import { unitMm } from "./types";

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function circle3(a: Pt, b: Pt, c: Pt): { center: Pt; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { center: { x: cx, y: cy }, r: Math.hypot(a.x - cx, a.y - cy) };
}

export function angleAt(a: Pt, v: Pt, b: Pt): number {
  const v1 = { x: a.x - v.x, y: a.y - v.y };
  const v2 = { x: b.x - v.x, y: b.y - v.y };
  const l1 = Math.hypot(v1.x, v1.y);
  const l2 = Math.hypot(v2.x, v2.y);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  const cos = Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (l1 * l2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function linesAngle(p1: Pt, p2: Pt, p3: Pt, p4: Pt): number {
  const a1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const a2 = Math.atan2(p4.y - p3.y, p4.x - p3.x);
  let d = Math.abs(a1 - a2) * (180 / Math.PI);
  d = Math.min(d, 180 - d);
  return d;
}

export function pointLineFoot(p: Pt, a: Pt, b: Pt): Pt {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const l2 = ax * ax + ay * ay;
  if (l2 < 1e-9) return { ...a };
  const t = ((p.x - a.x) * ax + (p.y - a.y) * ay) / l2;
  return { x: a.x + t * ax, y: a.y + t * ay };
}

export function pointLineDist(p: Pt, a: Pt, b: Pt): number {
  return dist(p, pointLineFoot(p, a, b));
}

export function parallelDist(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  return (
    (pointLineDist(a1, b1, b2) +
      pointLineDist(a2, b1, b2) +
      pointLineDist(b1, a1, a2) +
      pointLineDist(b2, a1, a2)) /
    4
  );
}

export function polygonArea(pts: Pt[]): number {
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

export function polygonPerimeter(pts: Pt[], closed: boolean): number {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += dist(pts[i], pts[i + 1]);
  if (closed && pts.length > 2) s += dist(pts[pts.length - 1], pts[0]);
  return s;
}

export function ellipseCircumference(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

export function polygonCentroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/* ---------------- Homographie (4-Punkt-Perspektive) ---------------- */

function solveLin(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) continue;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(M[i][i]) < 1e-12 ? 0 : row[n] / M[i][i]));
}

/**
 * Löst H (8 Parameter, h33 = 1) mit dst = H · src.
 * src: 4 Eckpunkte im Entzerrungsraum, dst: 4 gewählte Punkte im Originalbild.
 */
export function homography(src: [Pt, Pt, Pt, Pt], dst: [Pt, Pt, Pt, Pt]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const x = src[i].x, y = src[i].y, u = dst[i].x, v = dst[i].y;
    // Unbekannte: [h11, h12, h13, h21, h22, h23, h31, h32] (h33 = 1)
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return solveLin(A, b);
}

export function applyH(h: number[], x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + 1;
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

/* ---------------- Kalibrierung / Einheiten ---------------- */

export function mmPerPx(cal: Calibration | null | undefined, W: number): number | null {
  if (!cal) return null;
  if (cal.kind === "reference" && cal.ref) {
    const px = dist(cal.ref.a, cal.ref.b);
    const mm = cal.ref.distance * unitMm(cal.ref.unit);
    if (px < 1e-6 || mm <= 0) return null;
    return mm / px;
  }
  if (cal.kind === "perspective" && cal.persp) {
    const mm = (cal.persp.realW ?? cal.persp.realH ?? 0) * unitMm(cal.persp.unit);
    if (mm <= 0) return null;
    return mm / W;
  }
  return null;
}

export function formatValue(px: number, mpp: number | null, unit: UnitId): string {
  if (unit === "px" || mpp === null) {
    return `${smart(px)} px`;
  }
  const mm = px * mpp;
  const f = unitMm(unit);
  const v = mm / f;
  return `${smart(v)} ${unit}`;
}

export function formatAreaPx(areaPx: number, mpp: number | null, unit: UnitId): string {
  if (unit === "px" || mpp === null) return `${smart(areaPx)} px²`;
  const mm2 = areaPx * mpp * mpp;
  const f = unitMm(unit) * unitMm(unit);
  const v = mm2 / f;
  // Bei kleinen Flächen in mm² anzeigen
  if (f !== 1 && Math.abs(v) < 0.01 && unit !== "mm") {
    return `${smart(mm2)} mm²`;
  }
  return `${smart(v)} ${unit}²`;
}

export function smart(v: number): string {
  const a = Math.abs(v);
  if (a >= 100000) return v.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  if (a >= 1000) return v.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  if (a >= 100) return v.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  if (a >= 10) return v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  if (a >= 1) return v.toLocaleString("de-DE", { maximumFractionDigits: 3 });
  if (a === 0) return "0";
  return v.toLocaleString("de-DE", { maximumFractionDigits: 4 });
}

/* ---------------- Messwert-Berechnung pro Typ ---------------- */

export interface ValueOut {
  primary: string;
  details: [string, string][];
}

const L = (px: number, mpp: number | null, u: UnitId) => formatValue(px, mpp, u);
const A = (px2: number, mpp: number | null, u: UnitId) => formatAreaPx(px2, mpp, u);

export function measureValue(
  m: Measurement,
  mpp: number | null,
  unit: UnitId,
  draft: Pt[] = m.points
): ValueOut {
  const d = draft;
  const P = (i: number) => d[i] ?? { x: 0, y: 0 };
  switch (m.type) {
    case "line":
      return { primary: L(dist(P(0), P(1)), mpp, unit), details: [["Länge", L(dist(P(0), P(1)), mpp, unit)]] };
    case "polyline": {
      const len = polygonPerimeter(d, false);
      return { primary: L(len, mpp, unit), details: [["Gesamtlänge", L(len, mpp, unit)]] };
    }
    case "polygon": {
      const a = polygonArea(d);
      const p = polygonPerimeter(d, true);
      return {
        primary: A(a, mpp, unit),
        details: [
          ["Fläche", A(a, mpp, unit)],
          ["Umfang", L(p, mpp, unit)],
          ["Ecken", `${d.length}`],
        ],
      };
    }
    case "rect": {
      const w = Math.abs(P(1).x - P(0).x);
      const h = Math.abs(P(1).y - P(0).y);
      const a = w * h;
      const p = 2 * (w + h);
      return {
        primary: A(a, mpp, unit),
        details: [
          ["Breite", L(w, mpp, unit)],
          ["Höhe", L(h, mpp, unit)],
          ["Fläche", A(a, mpp, unit)],
          ["Umfang", L(p, mpp, unit)],
        ],
      };
    }
    case "ellipse": {
      const a = Math.abs(P(1).x - P(0).x);
      const b = Math.abs(P(2).y - P(0).y);
      const area = Math.PI * a * b;
      const c = ellipseCircumference(a, b);
      return {
        primary: A(area, mpp, unit),
        details: [
          ["Halbachse a", L(a, mpp, unit)],
          ["Halbachse b", L(b, mpp, unit)],
          ["Fläche", A(area, mpp, unit)],
          ["Umfang", L(c, mpp, unit)],
        ],
      };
    }
    case "circle": {
      const c = circle3(P(0), P(1), P(2));
      if (!c) return { primary: "—", details: [] };
      return {
        primary: L(2 * c.r, mpp, unit),
        details: [
          ["Mittelpunkt", `${smart(c.center.x)}, ${smart(c.center.y)}`],
          ["Radius", L(c.r, mpp, unit)],
          ["Durchmesser", L(2 * c.r, mpp, unit)],
          ["Fläche", A(Math.PI * c.r * c.r, mpp, unit)],
        ],
      };
    }
    case "angle":
      return { primary: `${smart(angleAt(P(0), P(1), P(2)))}°`, details: [["Winkel", `${smart(angleAt(P(0), P(1), P(2)))}°`]] };
    case "lineangle": {
      const v = linesAngle(P(0), P(1), P(2), P(3));
      return { primary: `${smart(v)}°`, details: [["Schnittwinkel", `${smart(v)}°`]] };
    }
    case "lot": {
      const f = pointLineFoot(P(2), P(0), P(1));
      const dd = dist(P(2), f);
      return { primary: L(dd, mpp, unit), details: [["Abstand", L(dd, mpp, unit)]] };
    }
    case "parallel": {
      const dd = parallelDist(P(0), P(1), P(2), P(3));
      return { primary: L(dd, mpp, unit), details: [["Abstand", L(dd, mpp, unit)]] };
    }
    case "marker":
      return { primary: `Nr. 1`, details: [["Position", `${smart(P(0).x)}, ${smart(P(0).y)}`]] };
    default:
      return { primary: "—", details: [] };
  }
}

/** Mindestanzahl Punkte, damit eine Messung gültig ist */
export function minPoints(type: string): number {
  switch (type) {
    case "line":
    case "rect":
    case "arrow":
      return 2;
    case "ellipse":
    case "circle":
    case "angle":
    case "lot":
      return 3;
    case "lineangle":
    case "parallel":
      return 4;
    case "polygon":
      return 3;
    case "polyline":
      return 2;
    case "marker":
    case "text":
      return 1;
    default:
      return 2;
  }
}
