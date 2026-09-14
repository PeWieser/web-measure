import type { Measurement, Pt, UnitId, Adjustments, CountItem } from "./types";
import {
  circle3,
  dist,
  measureValue,
  pointLineFoot,
  polygonCentroid,
  smart,
} from "./geometry";
import { unitMm } from "./types";

export interface SceneOpts {
  source: CanvasImageSource;
  W: number;
  H: number;
  filter?: string;
  edges?: HTMLCanvasElement | null;
  measurements: Measurement[];
  selectedId?: string | null;
  mpp: number | null;
  unit: UnitId;
  zoom: number;
  draft?: { type: string; points: Pt[]; cursor: Pt | null } | null;
  draftTool?: string;
  snapPoint?: Pt | null;
  pendingCalib?: { kind: string; points: Pt[] } | null;
  countItems?: CountItem[] | null;
  showNumbers?: boolean;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  txt: string,
  x: number,
  y: number,
  color: string,
  zoom: number,
  alpha = 1
) {
  const fs = 12.5 / zoom;
  const pad = 6 / zoom;
  const h = 19 / zoom;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `500 ${fs}px "IBM Plex Mono", ui-monospace, monospace`;
  const w = ctx.measureText(txt).width + pad * 2;
  const bx = x + 10 / zoom;
  const by = y - h - 6 / zoom;
  ctx.fillStyle = "rgba(12,14,17,0.88)";
  rr(ctx, bx, by, w, h, 4 / zoom);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / zoom;
  ctx.stroke();
  ctx.fillStyle = "#F4F6FA";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(txt, bx + pad, by + h / 2 + 0.5 / zoom);
  ctx.restore();
}

function dot(ctx: CanvasRenderingContext2D, p: Pt, color: string, zoom: number, r = 3.5) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r / zoom, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.2 / zoom;
  ctx.strokeStyle = "rgba(10,12,14,0.9)";
  ctx.stroke();
}

function head(
  ctx: CanvasRenderingContext2D,
  from: Pt,
  to: Pt,
  color: string,
  zoom: number,
  both = false
) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const len = 11 / zoom;
  const draw = (tip: Pt, a: number) => {
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - len * Math.cos(a - 0.42), tip.y - len * Math.sin(a - 0.42));
    ctx.lineTo(tip.x - len * Math.cos(a + 0.42), tip.y - len * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  draw(to, ang);
  if (both) draw(from, ang + Math.PI);
}

function anchorFor(m: { type: string; points: Pt[] }, draftPts?: Pt[]): Pt {
  const d = draftPts ?? m.points;
  const P = (i: number) => d[i] ?? { x: 0, y: 0 };
  switch (m.type) {
    case "polygon":
      return polygonCentroid(d);
    case "rect":
      return { x: (P(0).x + P(1).x) / 2, y: (P(0).y + P(1).y) / 2 };
    case "ellipse":
      return P(0);
    case "circle": {
      const c = circle3(P(0), P(1), P(2));
      return c ? { x: c.center.x, y: c.center.y + c.r } : P(0);
    }
    case "angle": {
      if (d.length < 3) return P(1);
      const a1 = Math.atan2(P(0).y - P(1).y, P(0).x - P(1).x);
      const a2 = Math.atan2(P(2).y - P(1).y, P(2).x - P(1).x);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const bis = a1 + diff / 2;
      return { x: P(1).x + 38 * Math.cos(bis), y: P(1).y + 38 * Math.sin(bis) };
    }
    case "lineangle":
      return { x: (P(0).x + P(2).x) / 2, y: (P(0).y + P(2).y) / 2 };
    case "lot":
      return {
        x: (P(2).x + pointLineFoot(P(2), P(0), P(1)).x) / 2,
        y: (P(2).y + pointLineFoot(P(2), P(0), P(1)).y) / 2,
      };
    case "parallel":
      return { x: (P(0).x + P(3).x) / 2, y: (P(0).y + P(3).y) / 2 };
    default: {
      const mid = Math.floor(d.length / 2);
      const a = d[mid - 1] ?? d[0];
      const b = d[mid] ?? d[0];
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
    }
  }
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  color: string,
  zoom: number,
  closed = false,
  dash: number[] = []
) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (closed) ctx.closePath();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 / zoom;
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawMeasurement(
  ctx: CanvasRenderingContext2D,
  m: Measurement,
  mpp: number | null,
  unit: UnitId,
  zoom: number,
  selected: boolean,
  markerNo?: number
) {
  const c = m.color;
  const d = m.points;
  const P = (i: number) => d[i] ?? { x: 0, y: 0 };
  const lineW = (selected ? 2.4 : 1.6) / zoom;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (m.type) {
    case "line":
    case "arrow": {
      if (d.length < 2) break;
      strokePath(ctx, [P(0), P(1)], c, zoom);
      ctx.lineWidth = lineW;
      if (m.type === "arrow") head(ctx, P(0), P(1), c, zoom);
      dot(ctx, P(0), c, zoom);
      dot(ctx, P(1), c, zoom);
      break;
    }
    case "polyline":
      if (d.length >= 2) {
        strokePath(ctx, d, c, zoom);
        d.forEach((p) => dot(ctx, p, c, zoom));
      }
      break;
    case "polygon": {
      if (d.length >= 2) {
        ctx.beginPath();
        d.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        if (d.length >= 3) ctx.closePath();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = c;
        ctx.fill();
        ctx.globalAlpha = 1;
        strokePath(ctx, d, c, zoom, d.length >= 3);
        d.forEach((p) => dot(ctx, p, c, zoom));
      }
      break;
    }
    case "rect": {
      if (d.length < 2) break;
      const x = Math.min(P(0).x, P(1).x);
      const y = Math.min(P(0).y, P(1).y);
      const w = Math.abs(P(1).x - P(0).x);
      const h = Math.abs(P(1).y - P(0).y);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = lineW;
      ctx.strokeRect(x, y, w, h);
      dot(ctx, P(0), c, zoom);
      dot(ctx, P(1), c, zoom);
      break;
    }
    case "ellipse": {
      if (d.length < 3) break;
      const a = Math.abs(P(1).x - P(0).x);
      const b = Math.abs(P(2).y - P(0).y);
      ctx.beginPath();
      ctx.ellipse(P(0).x, P(0).y, Math.max(a, 0.1), Math.max(b, 0.1), 0, 0, Math.PI * 2);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = c;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = lineW;
      ctx.stroke();
      dot(ctx, P(0), c, zoom, 2.5);
      dot(ctx, P(1), c, zoom);
      dot(ctx, P(2), c, zoom);
      break;
    }
    case "circle": {
      if (d.length < 3) break;
      const cc = circle3(P(0), P(1), P(2));
      if (!cc) break;
      ctx.beginPath();
      ctx.arc(cc.center.x, cc.center.y, cc.r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = c;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = lineW;
      ctx.stroke();
      // Mittelpunkt + Radius
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.beginPath();
      ctx.moveTo(cc.center.x, cc.center.y);
      ctx.lineTo(cc.center.x + cc.r, cc.center.y);
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      ctx.setLineDash([]);
      dot(ctx, cc.center, c, zoom, 2.5);
      [P(0), P(1), P(2)].forEach((p) => dot(ctx, p, c, zoom));
      break;
    }
    case "angle": {
      if (d.length < 3) break;
      const v = P(1);
      strokePath(ctx, [P(0), v], c, zoom);
      strokePath(ctx, [v, P(2)], c, zoom);
      const a1 = Math.atan2(P(0).y - v.y, P(0).x - v.x);
      const a2 = Math.atan2(P(2).y - v.y, P(2).x - v.x);
      let d1 = a1;
      let d2 = a2;
      // kurzer Bogen
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      d1 = a1;
      d2 = a1 + diff;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 22 / zoom, d1, d2, diff < 0);
      ctx.strokeStyle = c;
      ctx.lineWidth = lineW;
      ctx.stroke();
      dot(ctx, v, c, zoom);
      dot(ctx, P(0), c, zoom);
      dot(ctx, P(2), c, zoom);
      break;
    }
    case "lineangle": {
      if (d.length < 4) break;
      strokePath(ctx, [P(0), P(1)], c, zoom);
      strokePath(ctx, [P(2), P(3)], c, zoom);
      [P(0), P(1), P(2), P(3)].forEach((p) => dot(ctx, p, c, zoom));
      break;
    }
    case "lot": {
      if (d.length < 3) break;
      const f = pointLineFoot(P(2), P(0), P(1));
      strokePath(ctx, [P(0), P(1)], c, zoom);
      strokePath(ctx, [P(2), f], c, zoom);
      head(ctx, P(2), f, c, zoom, true);
      dot(ctx, P(0), c, zoom);
      dot(ctx, P(1), c, zoom);
      dot(ctx, P(2), c, zoom);
      // Rechtwinkel-Markierung
      const ux = (P(1).x - P(0).x) / Math.max(dist(P(0), P(1)), 1e-6);
      const uy = (P(1).y - P(0).y) / Math.max(dist(P(0), P(1)), 1e-6);
      const s = 8 / zoom;
      ctx.beginPath();
      ctx.moveTo(f.x + ux * s, f.y + uy * s);
      ctx.lineTo(f.x + ux * s - uy * s, f.y + uy * s + ux * s);
      ctx.lineTo(f.x - uy * s, f.y + ux * s);
      ctx.strokeStyle = c;
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
      break;
    }
    case "parallel": {
      if (d.length < 4) break;
      strokePath(ctx, [P(0), P(1)], c, zoom);
      strokePath(ctx, [P(2), P(3)], c, zoom);
      const m1 = { x: (P(0).x + P(1).x) / 2, y: (P(0).y + P(1).y) / 2 };
      const m2 = { x: (P(2).x + P(3).x) / 2, y: (P(2).y + P(3).y) / 2 };
      const f1 = pointLineFoot(m1, P(2), P(3));
      const f2 = pointLineFoot(m2, P(0), P(1));
      strokePath(ctx, [f1, f2], c, zoom);
      head(ctx, f1, f2, c, zoom, true);
      [P(0), P(1), P(2), P(3)].forEach((p) => dot(ctx, p, c, zoom));
      break;
    }
    case "marker": {
      const p = P(0);
      const r = 11 / zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = c;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1.8 / zoom;
      ctx.stroke();
      const fs = 11 / zoom;
      ctx.font = `600 ${fs}px "IBM Plex Mono", monospace`;
      ctx.fillStyle = c;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(markerNo ?? 1), p.x, p.y + 0.5 / zoom);
      break;
    }
    case "text": {
      const p = P(0);
      const fs = (m.size ?? 16) / zoom;
      ctx.font = `600 ${fs}px "IBM Plex Sans", sans-serif`;
      const txt = m.text || "Text";
      const tw = ctx.measureText(txt).width;
      const pad = 5 / zoom;
      ctx.fillStyle = "rgba(12,14,17,0.7)";
      rr(ctx, p.x - pad, p.y - fs - pad, tw + pad * 2, fs + pad * 2, 3 / zoom);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
      }
      ctx.fillStyle = c;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(txt, p.x, p.y);
      break;
    }
  }
  ctx.restore();

  // Wert-Label
  const showValue = !["marker", "text", "arrow"].includes(m.type);
  if (showValue && d.length >= 2) {
    const tmp: Measurement = { ...m, points: d };
    const v = measureValue(tmp, mpp, unit);
    const anchor = anchorFor(m, d);
    drawLabel(ctx, v.primary, anchor.x, anchor.y, c, zoom);
  }

  // Auswahldarstellung
  if (selected && m.type !== "text") {
    const hs = 5.5 / zoom;
    for (const p of d) {
      ctx.save();
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = "#14161A";
      ctx.lineWidth = 1.4 / zoom;
      ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
      ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
      ctx.restore();
    }
  }
}

export function drawDraft(
  ctx: CanvasRenderingContext2D,
  draft: { type: string; points: Pt[]; cursor: Pt | null },
  mpp: number | null,
  unit: UnitId,
  zoom: number
) {
  const pts = draft.cursor ? [...draft.points, draft.cursor] : draft.points;
  const tmp: Measurement = {
    id: "draft",
    type: draft.type as Measurement["type"],
    name: "Vorschau",
    color: "#FFC24B",
    visible: true,
    points: draft.points,
  };
  // Geometrie zeichnen
  ctx.save();
  ctx.globalAlpha = 0.9;
  drawMeasurement(ctx, { ...tmp, points: pts }, mpp, unit, zoom, false);
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, o: SceneOpts) {
  // Bild
  if (o.filter && o.filter !== "none") ctx.filter = o.filter;
  ctx.imageSmoothingEnabled = o.zoom < 1 ? true : true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(o.source, 0, 0, o.W, o.H);
  ctx.filter = "none";

  // Kanten-Overlay
  if (o.edges) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(o.edges, 0, 0, o.W, o.H);
    ctx.restore();
  }

  // Zähl-Marker
  if (o.showNumbers && o.countItems) {
    o.countItems.forEach((it, i) => {
      const r = Math.max(it.r, 9 / o.zoom);
      ctx.beginPath();
      ctx.arc(it.x, it.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "#E5484D";
      ctx.lineWidth = 1.6 / o.zoom;
      ctx.stroke();
      const fs = 10.5 / o.zoom;
      ctx.font = `600 ${fs}px "IBM Plex Mono", monospace`;
      const txt = String(i + 1);
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = "rgba(16,18,22,0.85)";
      rr(ctx, it.x + r * 0.7, it.y - r - fs - 3 / o.zoom, tw + 6 / o.zoom, fs + 4 / o.zoom, 3 / o.zoom);
      ctx.fill();
      ctx.fillStyle = "#FF8A8E";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, it.x + r * 0.7 + 3 / o.zoom, it.y - r - (fs + 4 / o.zoom) / 2);
    });
  }

  // Messungen
  let markerNo = 0;
  for (const m of o.measurements) {
    if (!m.visible) continue;
    if (m.type === "marker") markerNo++;
    drawMeasurement(ctx, m, o.mpp, o.unit, o.zoom, m.id === o.selectedId, markerNo);
  }

  // Kalibrierungs-Vorschau
  if (o.pendingCalib) {
    const p = o.pendingCalib.points;
    if (p.length >= 2) {
      strokePath(ctx, p, "#FFC24B", o.zoom, o.pendingCalib.kind === "perspective" && p.length === 4);
    }
    if (o.pendingCalib.kind === "perspective" && p.length === 4) {
      const m = polygonCentroid(p);
      drawLabel(ctx, `Perspektive · Eckpunkte ${p.length}/4`, m.x, m.y, "#FFC24B", o.zoom);
    }
    p.forEach((pt) => dot(ctx, pt, "#FFC24B", o.zoom, 4));
    if (o.draft?.cursor && p.length < (o.pendingCalib.kind === "perspective" ? 4 : 2)) {
      strokePath(ctx, [p[p.length - 1], o.draft.cursor], "#FFC24B", o.zoom, false, [5 / o.zoom, 5 / o.zoom]);
    }
  }

  // Draft
  if (o.draft && o.draft.points.length > 0) {
    const d = o.draft;
    if (d.type === "calib2" || d.type === "calib4") {
      const pts = d.cursor ? [...d.points, d.cursor] : d.points;
      if (pts.length >= 2) strokePath(ctx, pts, "#FFC24B", o.zoom, false, [6 / o.zoom, 5 / o.zoom]);
      if (d.type === "calib4" && pts.length === 4) {
        strokePath(ctx, [pts[3], pts[0]], "#FFC24B", o.zoom, false, [6 / o.zoom, 5 / o.zoom]);
        const c = polygonCentroid(pts);
        drawLabel(ctx, `Perspektive · ${pts.length}/4 Eckpunkte`, c.x, c.y, "#FFC24B", o.zoom);
      }
      if (d.type === "calib2" && pts.length === 2) {
        drawLabel(
          ctx,
          `${smart(dist(pts[0], pts[1]))} px`,
          (pts[0].x + pts[1].x) / 2,
          (pts[0].y + pts[1].y) / 2,
          "#FFC24B",
          o.zoom
        );
      }
      pts.forEach((p) => dot(ctx, p, "#FFC24B", o.zoom, 4));
    } else if (d.points.length > 0) {
      drawDraft(ctx, d, o.mpp, o.unit, o.zoom);
    }
  }

  // Snap-Punkt
  if (o.snapPoint) {
    const p = o.snapPoint;
    ctx.save();
    ctx.strokeStyle = "#62D26F";
    ctx.lineWidth = 1.4 / o.zoom;
    ctx.setLineDash([3 / o.zoom, 3 / o.zoom]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7 / o.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p.x - 11 / o.zoom, p.y);
    ctx.lineTo(p.x + 11 / o.zoom, p.y);
    ctx.moveTo(p.x, p.y - 11 / o.zoom);
    ctx.lineTo(p.x, p.y + 11 / o.zoom);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------- Maßstabsleiste ---------------- */

export function niceScalebar(
  mpp: number | null,
  unit: UnitId,
  targetPx = 170
): { value: number; px: number; label: string } | null {
  if (!mpp || unit === "px") return null;
  const mm = targetPx * mpp;
  const f = unitMm(unit);
  let v = mm / f;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10;
  v = nice * pow;
  const px = (v * f) / mpp;
  const label =
    v >= 10
      ? `${Math.round(v)}`
      : v >= 1
        ? v.toLocaleString("de-DE", { maximumFractionDigits: 2 })
        : v.toLocaleString("de-DE", { maximumFractionDigits: 3 });
  return { value: v, px, label: `${label} ${unit}` };
}

export function drawScalebarScreen(
  ctx: CanvasRenderingContext2D,
  sb: { value: number; px: number; label: string },
  x: number,
  y: number,
  dpr: number
) {
  ctx.save();
  ctx.scale(dpr, dpr);
  const w = sb.px;
  const h = 7;
  // Hintergrund
  ctx.fillStyle = "rgba(12,14,17,0.78)";
  rr(ctx, x - 10, y - 26, w + 20, 44, 6);
  ctx.fill();
  // Balken
  const by = y + 10;
  ctx.strokeStyle = "rgba(240,244,250,0.95)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, by, w, h);
  // Mitte
  const half = w / 2;
  if (Math.floor(sb.value * 10) / 10 % 1 === 0) {
    ctx.fillStyle = "rgba(240,244,250,0.95)";
    ctx.fillRect(x, by, half, h / 2);
  }
  ctx.strokeRect(x + half, by, 1, h / 2);
  // Beschriftung
  ctx.fillStyle = "#F2F4F8";
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(sb.label, x, y - 8);
  ctx.restore();
}

export function filterString(a: Adjustments): string {
  const parts: string[] = [];
  if (Math.abs(a.brightness - 100) > 0.1) parts.push(`brightness(${a.brightness / 100})`);
  if (Math.abs(a.contrast - 100) > 0.1) parts.push(`contrast(${a.contrast / 100})`);
  if (Math.abs(a.saturate - 100) > 0.1) parts.push(`saturate(${a.saturate / 100})`);
  return parts.length ? parts.join(" ") : "none";
}
