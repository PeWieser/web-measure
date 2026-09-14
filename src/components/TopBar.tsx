import { useEffect, useRef, useState } from "react";
import { useStore, useUi } from "@/store";
import { getBitmap, getWarped, sendCmd, useSave } from "@/lib/session";
import { mmPerPx } from "@/lib/geometry";
import { exportBurnIn, exportCSV, exportXLSX, calibrationLabel } from "@/lib/export";
import { I } from "./Icons";

function ZoomBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-mist-400 transition-colors hover:bg-ink-750 hover:text-mist-100"
    >
      {icon}
    </button>
  );
}

export default function TopBar() {
  const name = useStore((s) => s.name);
  const width = useStore((s) => s.width);
  const calibrations = useStore((s) => s.calibrations);
  const activeCalId = useStore((s) => s.activeCalId);
  const displayUnit = useStore((s) => s.displayUnit);
  const scalebar = useStore((s) => s.scalebar);
  const patch = useStore((s) => s.patch);
  const measurements = useStore((s) => s.measurements);
  const zoom = useUi((s) => s.zoom);
  const save = useSave();
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const activeCal = calibrations.find((c) => c.id === activeCalId) ?? null;
  const mpp = mmPerPx(activeCal, width);

  const doExport = async (kind: "csv" | "xlsx" | "png" | "jpeg") => {
    setExportOpen(false);
    if (kind === "csv") {
      exportCSV(name, measurements, mpp, displayUnit);
      return;
    }
    if (kind === "xlsx") {
      exportXLSX(name, measurements, mpp, displayUnit);
      return;
    }
    const bitmap = getBitmap();
    if (!bitmap) return;
    setBusy(kind);
    try {
      await new Promise((r) => setTimeout(r, 30));
      await exportBurnIn({
        bitmap,
        warped: getWarped(),
        adj: useStore.getState().adjustments,
        measurements,
        mpp,
        unit: displayUnit,
        name,
        format: kind,
        scalebar,
        countItems: useStore.getState().countResult,
        showNumbers: useStore.getState().showNumbers,
        W: width,
        H: useStore.getState().height,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-ink-700 bg-ink-900 px-3">
      <div className="flex items-center gap-2 pr-2">
        <span className="text-accent-400">
          <I.logo size={20} />
        </span>
        <span className="text-[13px] font-bold tracking-[0.18em] text-mist-100">MESSTISCH</span>
      </div>
      <div className="h-6 w-px bg-ink-700" />
      <input
        value={name}
        onChange={(e) => useStore.getState().patch({ name: e.target.value })}
        className="h-8 w-52 rounded-md border border-transparent bg-transparent px-2 text-[13px] font-medium text-mist-100 outline-none transition-colors hover:border-ink-600 focus:border-accent-500/60 focus:bg-ink-850"
        aria-label="Projektname"
      />
      <span
        className={`flex items-center gap-1.5 text-[11px] ${
          save.state === "saving"
            ? "text-mist-400"
            : save.state === "error"
              ? "text-bad-500"
              : "text-mist-600"
        }`}
        title="Automatisch gespeichert"
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            save.state === "saving"
              ? "anim-pulse-soft bg-accent-400"
              : save.state === "error"
                ? "bg-bad-500"
                : "bg-good-500"
          }`}
        />
        {save.state === "saving" ? "Speichert …" : save.state === "error" ? "Fehler" : "Gespeichert"}
      </span>

      <div className="flex-1" />

      {/* Kalibrierungsstatus */}
      <div
        className={`hidden h-8 items-center gap-2 rounded-md border px-3 text-[12px] md:flex ${
          mpp !== null
            ? "border-ink-700 bg-ink-850 text-mist-300"
            : "border-accent-500/40 bg-accent-500/10 text-accent-400"
        }`}
        title={calibrationLabel(activeCal)}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${mpp !== null ? "bg-good-500" : "bg-accent-400"}`} />
        {mpp !== null
          ? `${activeCal?.name ?? "Kalibriert"} · 1 px = ${(mpp).toLocaleString("de-DE", { maximumFractionDigits: 4 })} mm`
          : "Nicht kalibriert – Werte in px"}
      </div>

      {/* Zoom */}
      <div className="flex h-8 items-center rounded-md border border-ink-700 bg-ink-850">
        <ZoomBtn icon={<I.zoomOut size={16} />} label="Herauszoomen" onClick={() => sendCmd({ type: "zoomOut" })} />
        <button
          onClick={() => sendCmd({ type: "oneOne" })}
          className="min-w-16 px-1 font-mono text-[11.5px] text-mist-300 hover:text-mist-100"
          title="1:1 Darstellung"
        >
          {Math.round(zoom * 100)} %
        </button>
        <ZoomBtn icon={<I.zoomIn size={16} />} label="Hineinzoomen" onClick={() => sendCmd({ type: "zoomIn" })} />
        <div className="h-5 w-px bg-ink-700" />
        <ZoomBtn icon={<I.fit size={16} />} label="Gesamtes Bild einpassen (F)" onClick={() => sendCmd({ type: "fit" })} />
      </div>

      {/* Maßstabsleiste */}
      <button
        onClick={() => patch({ scalebar: !scalebar })}
        title="Maßstabsleiste im Bild ein-/ausblenden"
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors ${
          scalebar
            ? "border-accent-500/40 bg-accent-500/10 text-accent-400"
            : "border-ink-700 bg-ink-850 text-mist-400 hover:text-mist-100"
        }`}
      >
        <I.scalebar size={15} />
        <span className="hidden lg:inline">Maßstabsleiste</span>
      </button>

      {/* Export */}
      <div className="relative" ref={exportRef}>
        <button
          onClick={() => setExportOpen((v) => !v)}
          className="flex h-8 items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-3 text-[12px] font-medium text-mist-200 transition-colors hover:border-ink-600 hover:text-mist-100"
        >
          <I.download size={15} />
          Export
          <svg width="10" height="10" viewBox="0 0 10 10" className="text-mist-500">
            <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-10 z-50 w-64 rounded-lg border border-ink-600 bg-ink-800 p-1.5 shadow-2xl">
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-mist-500">
              Messwerte
            </p>
            <button
              onClick={() => doExport("csv")}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] text-mist-200 hover:bg-ink-750"
            >
              <I.table size={16} className="text-mist-500" /> CSV-Datei (Excel)
            </button>
            <button
              onClick={() => doExport("xlsx")}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] text-mist-200 hover:bg-ink-750"
            >
              <I.table size={16} className="text-mist-500" /> Excel-Datei (.xlsx)
            </button>
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-mist-500">
              Bild mit Bemaßung (Burn-In)
            </p>
            <button
              disabled={busy !== null}
              onClick={() => doExport("png")}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] text-mist-200 hover:bg-ink-750 disabled:opacity-50"
            >
              <I.image size={16} className="text-mist-500" /> PNG {busy === "png" && "… wird erstellt"}
            </button>
            <button
              disabled={busy !== null}
              onClick={() => doExport("jpeg")}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] text-mist-200 hover:bg-ink-750 disabled:opacity-50"
            >
              <I.image size={16} className="text-mist-500" /> JPEG {busy === "jpeg" && "… wird erstellt"}
            </button>
          </div>
        )}
      </div>

      {/* Neu */}
      <button
        onClick={() => {
          if (!confirmNew) {
            setConfirmNew(true);
            if (confirmTimer.current) clearTimeout(confirmTimer.current);
            confirmTimer.current = setTimeout(() => setConfirmNew(false), 2500);
          } else {
            window.location.href = "/";
          }
        }}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors ${
          confirmNew
            ? "border-bad-500/50 bg-bad-500/15 text-bad-500"
            : "border-ink-700 bg-ink-850 text-mist-200 hover:border-ink-600 hover:text-mist-100"
        }`}
        title="Zur Übersicht / neues Projekt"
      >
        <I.upload size={15} />
        {confirmNew ? "Wirklich?" : "Übersicht"}
      </button>
    </div>
  );
}
