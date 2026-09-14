import { useEffect, useState } from "react";
import { useStore } from "@/store";
import {
  Calibration,
  MEASURE_COLORS,
  UNITS,
  UnitId,
  uid,
} from "@/lib/types";
import { mmPerPx, measureValue, smart, formatAreaPx, homography } from "@/lib/geometry";
import { getAnalysis } from "@/lib/session";
import { runCount } from "@/lib/imageproc";
import { exportCountCSV } from "@/lib/export";
import { I, IconComp } from "./Icons";

type TabId = "calib" | "meas" | "image" | "analysis";

const TABS: { id: TabId; icon: IconComp; label: string }[] = [
  { id: "calib", icon: "calib2", label: "Kalibrierung" },
  { id: "meas", icon: "table", label: "Messungen" },
  { id: "image", icon: "sliders", label: "Bild" },
  { id: "analysis", icon: "scan", label: "Analyse" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-500 first:mt-0">
      {children}
    </p>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between py-1.5 text-left text-[12.5px] text-mist-200"
    >
      <span>{label}</span>
      <span
        className={`relative h-4.5 w-8 rounded-full transition-colors ${on ? "bg-accent-500" : "bg-ink-600"}`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${on ? "left-4" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[12.5px] text-mist-300">{label}</span>
        <span className="font-mono text-[11px] text-mist-400">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

/* ================= Kalibrierung ================= */

function PendingCalibForm() {
  const s = useStore();
  const p = s.pendingCalib;
  const [name, setName] = useState("");
  const [distance, setDistance] = useState("10");
  const [unit, setUnit] = useState<UnitId>(s.displayUnit === "px" ? "mm" : s.displayUnit);
  const [realW, setRealW] = useState("");
  const [realH, setRealH] = useState("");
  if (!p) return null;
  const n = s.calibrations.length + 1;
  const measuredPx =
    p.kind === "reference" && p.points.length === 2
      ? Math.hypot(p.points[1].x - p.points[0].x, p.points[1].y - p.points[0].y)
      : null;

  const save = () => {
    if (p.kind === "reference" && p.points.length === 2) {
      const d = parseFloat(distance.replace(",", "."));
      if (!isFinite(d) || d <= 0) return;
      s.addCalibration({
        id: uid(),
        name: name.trim() || `Referenz ${n}`,
        kind: "reference",
        ref: { a: p.points[0], b: p.points[1], distance: d, unit },
      });
    } else if (p.kind === "perspective" && p.points.length === 4) {
      const W = s.width;
      const H = s.height;
      const src = [
        { x: 0, y: 0 },
        { x: W, y: 0 },
        { x: W, y: H },
        { x: 0, y: H },
      ] as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number }
      ];
      const h = homography(src, p.points as typeof src);
      const rw = parseFloat(realW.replace(",", "."));
      const rh = parseFloat(realH.replace(",", "."));
      s.addCalibration({
        id: uid(),
        name: name.trim() || `Perspektive ${n}`,
        kind: "perspective",
        persp: {
          pts: p.points as [
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number },
            { x: number; y: number }
          ],
          realW: isFinite(rw) && rw > 0 ? rw : undefined,
          realH: isFinite(rh) && rh > 0 ? rh : undefined,
          unit,
          homography: h,
        },
      });
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-accent-500/50 bg-accent-500/[0.07] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-400">
        {p.kind === "reference" ? "Referenzmaß bestätigen" : "Perspektive bestätigen"}
      </p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={p.kind === "reference" ? `Referenz ${n}` : `Perspektive ${n}`}
        className="mb-2 w-full rounded-md border border-ink-600 bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-mist-100 outline-none focus:border-accent-500/60"
      />
      {p.kind === "reference" ? (
        <>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-mist-500">Bekannter Abstand</label>
              <input
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-ink-600 bg-ink-950 px-2.5 py-1.5 font-mono text-[12.5px] text-mist-100 outline-none focus:border-accent-500/60"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-mist-500">Einheit</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitId)}
                className="rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 font-mono text-[12.5px] text-mist-100 outline-none focus:border-accent-500/60"
              >
                {UNITS.filter((u) => u.id !== "px").map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {measuredPx && measuredPx > 0.01 && (
            <p className="mt-2 font-mono text-[11px] text-mist-500">
              gemessen: {smart(measuredPx)} px → 1 px ={" "}
              {(
                (parseFloat(distance.replace(",", ".")) || 0) *
                (unit === "mm" ? 1 : unit === "cm" ? 10 : unit === "m" ? 1000 : unit === "inch" ? 25.4 : 304.8) /
                measuredPx
              ).toLocaleString("de-DE", { maximumFractionDigits: 5 })}{" "}
              {unit}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mb-2 text-[11.5px] leading-relaxed text-mist-400">
            Die Ebene (Punkt 1 → 4 im Uhrzeigersinn) wird entzerrt und auf den Bildrand gestreckt.
            Optional: reale Größe der Ebene für den Maßstab angeben.
          </p>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-mist-500">Breite (optional)</label>
              <input
                value={realW}
                onChange={(e) => setRealW(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-ink-600 bg-ink-950 px-2.5 py-1.5 font-mono text-[12.5px] text-mist-100 outline-none focus:border-accent-500/60"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] text-mist-500">Höhe (optional)</label>
              <input
                value={realH}
                onChange={(e) => setRealH(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-ink-600 bg-ink-950 px-2.5 py-1.5 font-mono text-[12.5px] text-mist-100 outline-none focus:border-accent-500/60"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="mb-1 block text-[11px] text-mist-500">Einheit der Größen</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as UnitId)}
              className="w-full rounded-md border border-ink-600 bg-ink-950 px-2 py-1.5 font-mono text-[12.5px] text-mist-100 outline-none focus:border-accent-500/60"
            >
              {UNITS.filter((u) => u.id !== "px").map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent-500 py-1.5 text-[12.5px] font-semibold text-ink-950 hover:bg-accent-400"
        >
          <I.check size={14} /> Kalibrierung speichern
        </button>
        <button
          onClick={() => s.cancelDraft()}
          className="rounded-md border border-ink-600 px-3 text-[12.5px] text-mist-400 hover:text-mist-100"
        >
          Verwerfen
        </button>
      </div>
    </div>
  );
}

function CalibTab() {
  const s = useStore();
  const mpp = mmPerPx(s.calibrations.find((c) => c.id === s.activeCalId) ?? null, s.width);

  return (
    <div className="p-3">
      <PendingCalibForm />
      <SectionTitle>Anzeigeeinheit</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {UNITS.filter((u) => u.id !== "px").map((u) => (
          <button
            key={u.id}
            onClick={() => s.patch({ displayUnit: u.id })}
            className={`rounded-md border px-2 py-1.5 font-mono text-[12px] transition-colors ${
              s.displayUnit === u.id
                ? "border-accent-500/60 bg-accent-500/15 text-accent-400"
                : "border-ink-700 bg-ink-850 text-mist-300 hover:border-ink-600"
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      <SectionTitle>Status</SectionTitle>
      <div
        className={`rounded-md border px-3 py-2.5 font-mono text-[11.5px] ${
          mpp !== null ? "border-good-500/30 bg-good-500/10 text-good-500" : "border-ink-700 bg-ink-850 text-mist-400"
        }`}
      >
        {mpp !== null
          ? `1 px = ${mpp.toLocaleString("de-DE", { maximumFractionDigits: 5 })} mm`
          : "Keine aktive Kalibrierung\nMesswerte werden in Pixel angezeigt."}
      </div>

      <SectionTitle>Gespeicherte Kalibrierungen</SectionTitle>
      {s.calibrations.length === 0 && (
        <div className="rounded-md border border-dashed border-ink-600 p-3 text-[12px] leading-relaxed text-mist-500">
          Noch keine Kalibrierung vorhanden.
          <p className="mt-2">
            <span className="text-mist-300">Empfohlen:</span> Werkzeug{" "}
            <kbd className="rounded border border-ink-600 bg-ink-950 px-1 font-mono text-[10px]">1</kbd>{" "}
            wählen, zwei Punkte eines bekannten Abstands (Lineal, Maßstabsleiste) markieren und den
            realen Wert eintragen.
          </p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {s.calibrations.map((c) => {
          const active = c.id === s.activeCalId;
          return (
            <div
              key={c.id}
              className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                active ? "border-accent-500/50 bg-accent-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-600"
              }`}
            >
              <button
                onClick={() => s.setActiveCal(active ? null : c.id)}
                title={active ? "Deaktivieren" : "Aktivieren"}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  active ? "border-accent-400" : "border-ink-600"
                }`}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-mist-100">{c.name}</p>
                <p className="font-mono text-[10.5px] text-mist-500">
                  {c.kind === "reference" && c.ref
                    ? `${c.ref.distance} ${c.ref.unit} / ${smart(Math.hypot(c.ref.b.x - c.ref.a.x, c.ref.b.y - c.ref.a.y))} px`
                    : `Perspektive${c.persp?.realW ? ` · ${c.persp.realW} ${c.persp.unit}` : ""}`}
                </p>
              </div>
              <button
                onClick={() => s.removeCalibration(c.id)}
                className="text-mist-600 opacity-0 transition-opacity hover:text-bad-500 group-hover:opacity-100"
                title="Kalibrierung löschen"
              >
                <I.trash size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Messungen ================= */

function MeasTab() {
  const s = useStore();
  const mpp = mmPerPx(s.calibrations.find((c) => c.id === s.activeCalId) ?? null, s.width);
  const [editingId, setEditingId] = useState<string | null>(null);

  const cycleColor = (id: string) => {
    const m = s.measurements.find((x) => x.id === id);
    if (!m) return;
    const idx = MEASURE_COLORS.indexOf(m.color);
    s.updateMeasurement(id, { color: MEASURE_COLORS[(idx + 1) % MEASURE_COLORS.length] });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3">
        <p className="text-[12px] text-mist-400">
          {s.measurements.length} {s.measurements.length === 1 ? "Vektor" : "Vektoren"}
        </p>
        <div className="flex gap-1">
          <button
            onClick={() =>
              import("@/lib/export").then((m) =>
                m.exportCSV(s.name, s.measurements, mpp, s.displayUnit)
              )
            }
            className="rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-mist-300 hover:border-ink-600 hover:text-mist-100"
          >
            CSV
          </button>
          <button
            onClick={() =>
              import("@/lib/export").then((m) =>
                m.exportXLSX(s.name, s.measurements, mpp, s.displayUnit)
              )
            }
            className="rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-mist-300 hover:border-ink-600 hover:text-mist-100"
          >
            Excel
          </button>
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-y-auto px-3 pb-3">
        {s.measurements.length === 0 && (
          <p className="rounded-md border border-dashed border-ink-600 p-3 text-[12px] leading-relaxed text-mist-500">
            Messungen erscheinen hier als verschiebbare Vektor-Layer. Ein Werkzeug aus der
            Leiste wählen, Punkte ins Bild klicken, Enter zur Bestätigung.
          </p>
        )}
        <div className="flex flex-col gap-1">
          {s.measurements.map((m, i) => {
            const v = measureValue(m, mpp, s.displayUnit);
            const selected = s.selectedId === m.id;
            return (
              <div
                key={m.id}
                onClick={() => s.select(selected ? null : m.id)}
                className={`group cursor-pointer rounded-md border px-2 py-1.5 transition-colors ${
                  selected ? "border-accent-500/60 bg-accent-500/10" : "border-transparent hover:bg-ink-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      cycleColor(m.id);
                    }}
                    className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/40"
                    style={{ background: m.color }}
                    title="Farbe wechseln"
                  />
                  <span className="w-5 shrink-0 font-mono text-[10px] text-mist-600">{i + 1}</span>
                  {editingId === m.id ? (
                    <input
                      autoFocus
                      defaultValue={m.name}
                      onBlur={(e) => {
                        s.updateMeasurement(m.id, { name: e.target.value || m.name });
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-950 px-1.5 py-0.5 text-[12px] text-mist-100 outline-none"
                    />
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate text-[12.5px] text-mist-200"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingId(m.id);
                      }}
                      title="Doppelklick zum Umbenennen"
                    >
                      {m.name}
                    </span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-mist-300">{v.primary}</span>
                  <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        s.updateMeasurement(m.id, { visible: !m.visible });
                      }}
                      className="text-mist-500 hover:text-mist-100"
                      title={m.visible ? "Ausblenden" : "Einblenden"}
                    >
                      {m.visible ? <I.eye size={14} /> : <I.eyeOff size={14} className="text-mist-600" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        useStore.setState({ selectedId: m.id });
                        useStore.getState().removeSelected();
                      }}
                      className="text-mist-500 hover:text-bad-500"
                      title="Löschen"
                    >
                      <I.trash size={14} />
                    </button>
                  </div>
                </div>
                {selected && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-10">
                    {v.details.map(([k, val]) => (
                      <span key={k} className="font-mono text-[10.5px] text-mist-500">
                        {k}: <span className="text-mist-300">{val}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================= Bild ================= */

function ImageTab() {
  const s = useStore();
  const a = s.adjustments;
  const setA = (p: Partial<typeof a>) => s.patch({ adjustments: { ...a, ...p } });

  return (
    <div className="p-3">
      <SectionTitle>Helligkeit &amp; Kontrast</SectionTitle>
      <Slider label="Helligkeit" value={a.brightness} min={0} max={200} step={1} display={`${a.brightness}%`} onChange={(v) => setA({ brightness: v })} />
      <Slider label="Kontrast" value={a.contrast} min={0} max={200} step={1} display={`${a.contrast}%`} onChange={(v) => setA({ contrast: v })} />
      <Slider label="Sättigung" value={a.saturate} min={0} max={200} step={1} display={`${a.saturate}%`} onChange={(v) => setA({ saturate: v })} />
      <Slider label="Gamma" value={a.gamma} min={0.4} max={2.5} step={0.05} display={a.gamma.toFixed(2)} onChange={(v) => setA({ gamma: v })} />
      <Slider label="Schärfen (Unsharp)" value={a.sharpen} min={0} max={100} step={1} display={`${a.sharpen}%`} onChange={(v) => setA({ sharpen: v })} />

      <div className="flex gap-1.5">
        <button
          onClick={() =>
            s.patch({
              adjustments: { brightness: 100, contrast: 100, saturate: 100, gamma: 1, sharpen: 0 },
            })
          }
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 py-1.5 text-[12px] text-mist-300 hover:border-ink-600 hover:text-mist-100"
        >
          <I.reset size={13} /> Zurücksetzen
        </button>
      </div>

      <SectionTitle>Erkennungsunterstützung</SectionTitle>
      <Toggle on={s.edgesOn} onChange={(v) => s.patch({ edgesOn: v })} label="Kantenhervorhebung (Sobel)" />
      <p className="mt-1 text-[11px] leading-relaxed text-mist-600">
        Kanten-Overlay, Gamma und Schärfen helfen, Messgrenzen besser zu erkennen. Sie wirken nur
        auf die Anzeige – die Vektormessungen bleiben unberührt.
      </p>

      <SectionTitle>Bild</SectionTitle>
      <div className="rounded-md border border-ink-700 bg-ink-850 px-3 py-2.5 font-mono text-[11px] text-mist-400">
        <p>{s.width} × {s.height} px</p>
        <p className="text-mist-600">{(s.width * s.height / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MP · Sub-Pixel-Messung</p>
      </div>
    </div>
  );
}

/* ================= Analyse ================= */

function AnalysisTab() {
  const s = useStore();
  const mpp = mmPerPx(s.calibrations.find((c) => c.id === s.activeCalId) ?? null, s.width);
  const [busy, setBusy] = useState(false);

  const analyze = async () => {
    const an = getAnalysis();
    if (!an) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const result = runCount(an.canvas, an.k, s.countCfg);
      s.patch({ countResult: result });
    } finally {
      setBusy(false);
    }
  };

  const res = s.countResult;
  const cfg = s.countCfg;

  return (
    <div className="p-3">
      <SectionTitle>Snap-to-Edge</SectionTitle>
      <Toggle on={s.snapOn} onChange={(v) => s.patch({ snapOn: v })} label="Messpunkte an Kanten einrasten" />
      {s.snapOn && (
        <>
          <Slider label="Erkennungsradius" value={s.snapRadius} min={8} max={80} step={1} display={`${s.snapRadius} px`} onChange={(v) => s.patch({ snapRadius: v })} />
          <Slider
            label="Empfindlichkeit"
            value={100 - s.snapStrength}
            min={10}
            max={100}
            step={1}
            display={`${100 - s.snapStrength}%`}
            onChange={(v) => s.patch({ snapStrength: 100 - v })}
          />
        </>
      )}

      <SectionTitle>Objekte zählen (Schwellenwert)</SectionTitle>
      <div className="rounded-md border border-ink-700 bg-ink-850 p-3">
        <Slider
          label="Schwellenwert (Grauwert)"
          value={cfg.threshold}
          min={0}
          max={255}
          step={1}
          display={String(cfg.threshold)}
          onChange={(v) => s.patch({ countCfg: { ...cfg, threshold: v } })}
        />
        <Slider
          label="Mindestgröße"
          value={cfg.minArea}
          min={1}
          max={500}
          step={1}
          display={`${cfg.minArea} px²`}
          onChange={(v) => s.patch({ countCfg: { ...cfg, minArea: v } })}
        />
        <div className="mt-1.5 mb-3">
          <Toggle on={cfg.invert} onChange={(v) => s.patch({ countCfg: { ...cfg, invert: v } })} label="Invertiert zählen (dunkle Objekte)" />
        </div>
        <button
          onClick={analyze}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-500 py-2 text-[12.5px] font-semibold text-ink-950 transition-colors hover:bg-accent-400 disabled:opacity-60"
        >
          {busy ? "Analysiere …" : "Objekte zählen & vermessen"}
        </button>
        {res && (
          <div className="mt-3 rounded-md border border-ink-700 bg-ink-950 p-2.5 font-mono text-[11px] leading-relaxed text-mist-300">
            <p className="text-[15px] font-semibold text-mist-100">
              {res.count.toLocaleString("de-DE")} <span className="text-[11px] font-normal text-mist-500">Objekte</span>
            </p>
            <p>Fläche gesamt: {formatAreaPx(res.totalAreaPx, mpp, s.displayUnit)}</p>
            <p className="text-mist-500">Ø {formatAreaPx(res.avgAreaPx, mpp, s.displayUnit)} · max {formatAreaPx(res.maxAreaPx, mpp, s.displayUnit)}</p>
          </div>
        )}
        {res && (
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() =>
                exportCountCSV(s.name, res, mpp, s.displayUnit)
              }
              className="flex-1 rounded-md border border-ink-700 bg-ink-850 py-1.5 text-[11.5px] text-mist-300 hover:border-ink-600 hover:text-mist-100"
            >
              Liste exportieren (CSV)
            </button>
            <button
              onClick={() => s.patch({ countResult: null })}
              className="rounded-md border border-ink-700 bg-ink-850 px-2.5 text-mist-400 hover:text-bad-500"
              title="Ergebnis verwerfen"
            >
              <I.trash size={14} />
            </button>
          </div>
        )}
        <div className="mt-2">
          <Toggle on={s.showNumbers} onChange={(v) => s.patch({ showNumbers: v })} label="Nummern im Bild anzeigen" />
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-mist-600">
        Die Analyse arbeitet auf 960-px-Auflösung zur Laufzeit. Partikelpositionen werden auf den
        Originalmaßstab zurückgerechnet.
      </p>
    </div>
  );
}

/* ================= Rahmen ================= */

export default function SidePanel() {
  const [tab, setTab] = useState<TabId>("calib");
  const measCount = useStore((s) => s.measurements.length);
  const hasPending = useStore((s) => s.pendingCalib !== null);
  useEffect(() => {
    if (hasPending) setTab("calib");
  }, [hasPending]);

  return (
    <div className="flex w-[300px] shrink-0 flex-col border-l border-ink-700 bg-ink-900">
      <div className="flex border-b border-ink-700">
        {TABS.map((t) => {
          const Icon = I[t.icon];
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-accent-400" : "text-mist-500 hover:text-mist-200"
              }`}
            >
              <Icon size={14} />
              {t.label}
              {t.id === "meas" && measCount > 0 && (
                <span className="rounded-full bg-ink-700 px-1.5 font-mono text-[9.5px] text-mist-300">
                  {measCount}
                </span>
              )}
              {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-t bg-accent-400" />}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "calib" && <CalibTab />}
        {tab === "meas" && <MeasTab />}
        {tab === "image" && <ImageTab />}
        {tab === "analysis" && <AnalysisTab />}
      </div>
    </div>
  );
}
