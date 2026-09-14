import * as XLSX from "xlsx";
import type { Calibration, Measurement, UnitId, Adjustments, CountResult } from "./types";
import { TYPE_LABEL } from "./types";
import { measureValue } from "./geometry";
import { drawScene, drawScalebarScreen, niceScalebar, filterString } from "./render";
import { makeCanvas, adjNeedsRebuild, rebuildWorking } from "./imageproc";

function rowsFor(measurements: Measurement[], mpp: number | null, unit: UnitId): string[][] {
  const head = ["Name", "Typ", "Hauptwert", "Einheit", "Details"];
  const rows: string[][] = [head];
  for (const m of measurements) {
    if (!m.visible) continue;
    const v = measureValue(m, mpp, unit);
    const unitName = mpp === null && unit !== "px" ? "px (ohne Kalibrierung)" : unit;
    rows.push([m.name, TYPE_LABEL[m.type], v.primary, unitName, v.details.map(([k, val]) => `${k}: ${val}`).join(" | ")]);
  }
  return rows;
}

export function exportCSV(name: string, measurements: Measurement[], mpp: number | null, unit: UnitId) {
  const rows = rowsFor(measurements, mpp, unit);
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  download(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `${safeName(name)}-messwerte.csv`);
}

export function exportXLSX(name: string, measurements: Measurement[], mpp: number | null, unit: UnitId) {
  const rows = rowsFor(measurements, mpp, unit);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Messwerte");
  XLSX.writeFile(wb, `${safeName(name)}-messwerte.xlsx`);
}

export function exportCountCSV(
  name: string,
  count: CountResult,
  mpp: number | null,
  unit: UnitId
) {
  const head = ["Nr.", "X (px)", "Y (px)", "Fläche (px²)", "Fläche"];
  const rows: string[][] = [head, ["Summe", "", "", String(Math.round(count.totalAreaPx)), areaOf(count.totalAreaPx, mpp, unit)], ["Objekte", "", "", String(count.count), ""]];
  count.items.forEach((it, i) =>
    rows.push([String(i + 1), String(Math.round(it.x)), String(Math.round(it.y)), String(Math.round(it.area)), areaOf(it.area, mpp, unit)])
  );
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  download(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `${safeName(name)}-zählung.csv`);
}

function areaOf(areaPx: number, mpp: number | null, unit: UnitId): string {
  if (mpp === null || unit === "px") return `${Math.round(areaPx)} px²`;
  const mm2 = areaPx * mpp * mpp;
  const f = 1; // mm²
  void f;
  return `${(mm2).toLocaleString("de-DE", { maximumFractionDigits: 1 })} mm²`;
}

function safeName(n: string) {
  return (n || "projekt").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Bild inkl. aller Vektormessungen als PNG/JPEG (Burn-In) */
export async function exportBurnIn(opts: {
  bitmap: ImageBitmap;
  warped: HTMLCanvasElement | null;
  adj: Adjustments;
  measurements: Measurement[];
  mpp: number | null;
  unit: UnitId;
  name: string;
  format: "png" | "jpeg";
  scalebar: boolean;
  countItems: CountResult | null;
  showNumbers: boolean;
  W: number;
  H: number;
}): Promise<void> {
  const { bitmap, warped, adj, measurements, mpp, unit, name, format, scalebar, countItems, showNumbers, W, H } = opts;
  const cap = 6000;
  const k = Math.min(1, cap / Math.max(W, H));
  const outW = Math.max(2, Math.round(W * k));
  const outH = Math.max(2, Math.round(H * k));
  const c = makeCanvas(outW, outH);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#101216";
  ctx.fillRect(0, 0, outW, outH);

  let source: CanvasImageSource = bitmap;
  if (warped) source = warped;
  else if (adjNeedsRebuild(adj)) source = rebuildWorking(bitmap, adj);

  const zoom = outW / W; // 1 "Bildpx" = zoom Ausgabepixel
  ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
  drawScene(ctx, {
    source,
    W,
    H,
    filter: filterString(adj),
    measurements,
    mpp,
    unit,
    zoom,
    countItems: countItems?.items ?? null,
    showNumbers,
  });

  // Maßstabsleiste in Ausgabepixeln
  if (scalebar) {
    const sb = niceScalebar(mpp, unit, 0.22 * W * zoom);
    if (sb) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawScalebarScreen(ctx, { ...sb, px: sb.px * zoom }, 24, outH - 26, 1);
    }
  }

  const blob = await new Promise<Blob | null>((res) =>
    c.toBlob(res, format === "png" ? "image/png" : "image/jpeg", 0.95)
  );
  if (!blob) throw new Error("Export fehlgeschlagen");
  download(blob, `${safeName(name)}-bemaßung.${format}`);
}

export function calibrationLabel(cal: Calibration | null): string {
  if (!cal) return "Keine Kalibrierung";
  if (cal.kind === "reference" && cal.ref) {
    return `${cal.name} · ${cal.ref.distance} ${cal.ref.unit} / Referenzlinie`;
  }
  return cal.name;
}
