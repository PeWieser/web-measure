import type { Adjustments, CountConfig, CountResult, Pt } from "./types";
import { applyH } from "./geometry";

export const WORK_CAP = 2400; // Arbeitsauflösung für Gamma/Schärfen
export const ANAL_CAP = 960; // Analyseauflösung für Snap/Zählen

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Verkleinerte Kopie für Analyse (Snap, Zählen, Kanten) */
export function makeAnalysisCanvas(bitmap: ImageBitmap): { canvas: HTMLCanvasElement; k: number } {
  const max = Math.max(bitmap.width, bitmap.height);
  const k = Math.min(1, ANAL_CAP / max);
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas: c, k };
}

export function adjNeedsRebuild(a: Adjustments): boolean {
  return Math.abs(a.gamma - 1) > 0.001 || a.sharpen > 0;
}

/** Gamma (LUT) + Unsharp-Maske auf Arbeitsauflösung */
export function rebuildWorking(bitmap: ImageBitmap, a: Adjustments): HTMLCanvasElement {
  const max = Math.max(bitmap.width, bitmap.height);
  const k = Math.min(1, WORK_CAP / max);
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (Math.abs(a.gamma - 1) > 0.001) applyGamma(ctx, w, h, a.gamma);
  if (a.sharpen > 0) applyUnsharp(ctx, w, h, a.sharpen / 100);
  return c;
}

function applyGamma(ctx: CanvasRenderingContext2D, w: number, h: number, gamma: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lut = new Uint8ClampedArray(256);
  const g = 1 / gamma;
  for (let i = 0; i < 256; i++) lut[i] = Math.round(255 * Math.pow(i / 256, g));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
}

function applyUnsharp(ctx: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const out = new Uint8ClampedArray(d.length);
  const a = Math.min(1.2, amt);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const l = x > 0 ? d[i - 4 + ch] : d[i + ch];
        const r = x < w - 1 ? d[i + 4 + ch] : d[i + ch];
        const u = y > 0 ? d[i - w * 4 + ch] : d[i + ch];
        const dn = y < h - 1 ? d[i + w * 4 + ch] : d[i + ch];
        const v = d[i + ch] + a * (4 * d[i + ch] - l - r - u - dn);
        out[i + ch] = v;
      }
      out[i + 3] = d[i + 3];
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
}

/** Sobel-Kantenhervorhebung als rotes Overlay (Analyseauflösung) */
export function sobelOverlay(anal: HTMLCanvasElement): HTMLCanvasElement {
  const w = anal.width;
  const h = anal.height;
  const src = anal.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(w, h);
  const d = out.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114);
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      const m = Math.hypot(gx, gy);
      if (m > 48) {
        const o = i * 4;
        d[o] = 255;
        d[o + 1] = 64;
        d[o + 2] = 48;
        d[o + 3] = Math.min(210, m * 0.55);
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Snap-to-Edge: stärkster Gradient im Umkreis des Cursors */
export function snapEdge(
  anal: HTMLCanvasElement,
  k: number,
  x: number,
  y: number,
  radiusPx: number,
  strength: number
): Pt | null {
  const w = anal.width;
  const h = anal.height;
  const data = anal.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const cx = x * k;
  const cy = y * k;
  const r = Math.max(3, radiusPx * k);
  const x0 = Math.max(1, Math.floor(cx - r));
  const x1 = Math.min(w - 2, Math.ceil(cx + r));
  const y0 = Math.max(1, Math.floor(cy - r));
  const y1 = Math.min(h - 2, Math.ceil(cy + r));
  const lum = (px: number, py: number) => {
    const o = (py * w + px) * 4;
    return data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
  };
  let best: Pt | null = null;
  let bestM = strength;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      if (Math.hypot(px - cx, py - cy) > r) continue;
      const gx = -lum(px - 1, py - 1) - 2 * lum(px, py - 1) - lum(px + 1, py - 1) + lum(px - 1, py + 1) + 2 * lum(px, py + 1) + lum(px + 1, py + 1);
      const gy = -lum(px - 1, py - 1) - 2 * lum(px - 1, py) - lum(px - 1, py + 1) + lum(px + 1, py - 1) + 2 * lum(px + 1, py) + lum(px + 1, py + 1);
      const m = Math.hypot(gx, gy);
      if (m > bestM) {
        bestM = m;
        best = { x: px / k, y: py / k };
      }
    }
  }
  return best;
}

/** Schwellenwert-Analyse: verbundene Komponenten zählen und vermessen */
export function runCount(anal: HTMLCanvasElement, k: number, cfg: CountConfig): CountResult {
  const w = anal.width;
  const h = anal.height;
  const data = anal.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const l = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
    mask[i] = cfg.invert ? (l < cfg.threshold ? 1 : 0) : l > cfg.threshold ? 1 : 0;
  }
  const labels = new Int32Array(w * h).fill(-1);
  const qx = new Int32Array(w * h);
  const qy = new Int32Array(w * h);
  const minPx = Math.max(1, cfg.minArea * k * k);
  let label = 0;
  const items: CountResult["items"] = [];
  let totalArea = 0;
  let maxArea = 0;
  const maxItems = 600;

  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    qx[tail] = start % w;
    qy[tail] = (start / w) | 0;
    tail++;
    labels[start] = label;
    let area = 0;
    let sx = 0;
    let sy = 0;
    while (head < tail) {
      const px = qx[head];
      const py = qy[head];
      head++;
      area++;
      sx += px;
      sy += py;
      const push = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const idx = ny * w + nx;
        if (mask[idx] && labels[idx] === -1) {
          labels[idx] = label;
          qx[tail] = nx;
          qy[tail] = ny;
          tail++;
        }
      };
      push(px + 1, py);
      push(px - 1, py);
      push(px, py + 1);
      push(px, py - 1);
    }
    if (area >= minPx) {
      const areaPx = area / (k * k);
      totalArea += areaPx;
      if (areaPx > maxArea) maxArea = areaPx;
      if (items.length < maxItems) {
        items.push({
          x: sx / area / k,
          y: sy / area / k,
          r: Math.max(4 / k, Math.sqrt(area / Math.PI) / k),
          area: areaPx,
        });
      }
    }
    label++;
  }
  const count = label;
  return {
    count,
    totalAreaPx: totalArea,
    avgAreaPx: count > 0 ? totalArea / count : 0,
    maxAreaPx: maxArea,
    items,
    k,
    at: Date.now(),
  };
}

/**
 * Perspektivische Entzerrung per Inverse Mapping.
 * h kartiert Entzerrungsraum → Originalbild. Chunked, um UI zu halten.
 */
export async function warpPerspective(
  bitmap: ImageBitmap,
  h: number[],
  cap = 2200
): Promise<HTMLCanvasElement> {
  const max = Math.max(bitmap.width, bitmap.height);
  const k = Math.min(1, cap / max);
  const W = Math.max(2, Math.round(bitmap.width * k));
  const H = Math.max(2, Math.round(bitmap.height * k));
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const src = makeCanvas(bitmap.width, bitmap.height);
  src.getContext("2d")!.drawImage(bitmap, 0, 0);
  const sdata = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height).data;
  const out = ctx.createImageData(W, H);
  const od = out.data;
  const sd = sdata;
  const sw = src.width;
  const sh = src.height;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = applyH(h, x / k, y / k);
      const i = (y * W + x) * 4;
      if (p.x < 0 || p.y < 0 || p.x > sw - 1 || p.y > sh - 1) {
        od[i + 3] = 255;
        od[i] = 18;
        od[i + 1] = 20;
        od[i + 2] = 24;
        continue;
      }
      const xi = Math.floor(p.x);
      const yi = Math.floor(p.y);
      const fx = p.x - xi;
      const fy = p.y - yi;
      const xi1 = Math.min(sw - 1, xi + 1);
      const yi1 = Math.min(sh - 1, yi + 1);
      for (let ch = 0; ch < 3; ch++) {
        const v00 = sd[(yi * sw + xi) * 4 + ch];
        const v10 = sd[(yi * sw + xi1) * 4 + ch];
        const v01 = sd[(yi1 * sw + xi) * 4 + ch];
        const v11 = sd[(yi1 * sw + xi1) * 4 + ch];
        od[i + ch] = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
      }
      od[i + 3] = 255;
    }
    if (y % 96 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  ctx.putImageData(out, 0, 0);
  return c;
}
