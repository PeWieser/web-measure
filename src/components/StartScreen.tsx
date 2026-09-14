"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { I } from "./Icons";

interface Row {
  id: string;
  name: string;
  width: number;
  height: number;
  size: number;
  updatedAt: string;
}

function fmtSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function StartScreen() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const bmp = await createImageBitmap(file);
      const name = file.name.replace(/\.[^.]+$/, "") || "Bild";
      const res = await fetch(
        `/api/projects?name=${encodeURIComponent(name)}&w=${bmp.width}&h=${bmp.height}`,
        {
          method: "POST",
          headers: { "Content-Type": file.type || "image/png" },
          body: file,
        }
      );
      bmp.close();
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Upload fehlgeschlagen (${res.status})`);
      }
      const { id } = await res.json();
      window.location.href = `/p/${id}`;
    } catch (e) {
      setError(
        e instanceof Error && e.message.includes("Upload")
          ? e.message
          : "Das Bild konnte nicht gelesen werden. Unterstützt: JPG, PNG, WebP, BMP – sehr große TIFF-Dateien bitte als PNG exportieren."
      );
      setBusy(false);
    }
  };

  const del = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((p) => p.filter((x) => x.id !== id));
    setConfirmDel(null);
  };

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="border-b border-ink-700/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2.5 px-6">
          <span className="text-accent-400">
            <I.logo size={22} />
          </span>
          <span className="text-[14px] font-bold tracking-[0.18em]">MESSTISCH</span>
          <span className="ml-3 hidden text-[12px] text-mist-600 sm:block">
            Vektorbasierte Bemaßung digitaler Bilder
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-[26px] font-semibold leading-snug text-mist-100">
          Bild hochladen und maßhaltig bemaßen.
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-mist-400">
          Ein Referenzmaß setzt den Maßstab, danach liefern Strecken, Flächen, Kreise, Winkel und
          Linien-Abstände echte Einheiten. Perspektiven werden per 4-Punkt-Kalibrierung entzerrt,
          Messwerte lassen sich als Tabelle oder bemaßtes Bild exportieren.
        </p>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => !busy && fileRef.current?.click()}
          className={`mt-7 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
            dragOver
              ? "border-accent-400 bg-accent-500/[0.06]"
              : "border-ink-600 bg-ink-900/50 hover:border-mist-600"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {busy ? (
            <>
              <svg width="30" height="30" viewBox="0 0 28 28" className="animate-spin text-accent-400">
                <circle cx="14" cy="14" r="11" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
                <path d="M14 3a11 11 0 0 1 11 11" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
              <p className="mt-3 text-[13px] font-medium text-mist-300">Bild wird hochgeladen …</p>
            </>
          ) : (
            <>
              <span className="text-mist-500">
                <I.upload size={30} />
              </span>
              <p className="mt-3 text-[13.5px] font-medium text-mist-200">
                Bild hierher ziehen oder <span className="text-accent-400">durchsuchen</span>
              </p>
              <p className="mt-1 text-[12px] text-mist-600">JPG · PNG · WebP · BMP – auch 8000 × 8000 px und größer</p>
            </>
          )}
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-bad-500/40 bg-bad-500/10 px-3 py-2.5 text-[12.5px] text-[#ff9a9e]">
            <I.warn size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Projektliste */}
        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mist-500">
            {projects.length > 0 ? `Projekte (${projects.length})` : "Projekte"}
          </h2>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-ink-700">
          {loading ? (
            <div className="bg-ink-900 px-5 py-8 text-center text-[12.5px] text-mist-500">Lade …</div>
          ) : projects.length === 0 ? (
            <div className="bg-ink-900 px-5 py-8 text-center text-[12.5px] text-mist-600">
              Noch keine Projekte. Alle Messungen bleiben pro Projekt in der Cloud-Applikation
              gespeichert und werden automatisch synchronisiert.
            </div>
          ) : (
            <table className="w-full bg-ink-900 text-left">
              <thead>
                <tr className="border-b border-ink-700 text-[10.5px] uppercase tracking-[0.12em] text-mist-600">
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="hidden px-4 py-2.5 font-semibold sm:table-cell">Auflösung</th>
                  <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Größe</th>
                  <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Aktualisiert</th>
                  <th className="w-24 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-850">
                    <td className="px-4 py-2.5 text-[13px] font-medium text-mist-100">{p.name}</td>
                    <td className="hidden px-4 py-2.5 font-mono text-[11.5px] text-mist-400 sm:table-cell">
                      {p.width} × {p.height}
                    </td>
                    <td className="hidden px-4 py-2.5 font-mono text-[11.5px] text-mist-500 md:table-cell">
                      {fmtSize(p.size)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-[11.5px] text-mist-500 md:table-cell">
                      {fmtDate(p.updatedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {confirmDel === p.id ? (
                          <>
                            <button
                              onClick={() => del(p.id)}
                              className="rounded border border-bad-500/50 bg-bad-500/15 px-2 py-1 text-[11px] font-medium text-bad-500"
                            >
                              Löschen
                            </button>
                            <button
                              onClick={() => setConfirmDel(null)}
                              className="rounded border border-ink-600 px-2 py-1 text-[11px] text-mist-400"
                            >
                              Abbrechen
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => (window.location.href = `/p/${p.id}`)}
                              className="rounded-md border border-ink-600 bg-ink-850 px-3 py-1.5 text-[12px] font-medium text-mist-200 hover:border-accent-500/50 hover:text-accent-400"
                            >
                              Öffnen
                            </button>
                            <button
                              onClick={() => setConfirmDel(p.id)}
                              className="rounded-md p-1.5 text-mist-600 hover:text-bad-500"
                              title="Projekt löschen"
                            >
                              <I.trash size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-ink-700 bg-ink-700 sm:grid-cols-3">
          {[
            {
              icon: I.calib2,
              t: "Kalibrierung",
              d: "Zwei-Punkt-Referenzmaß oder 4-Punkt-Perspektiven-Entzerrung. Mehrere Kalibrierungen pro Projekt, jederzeit umschaltbar.",
            },
            {
              icon: I.polygon,
              t: "Geometrie",
              d: "Strecken, Polylinien, Polygone, Rechtecke, Ellipsen, 3-Punkt-Kreise, Winkel, Schnitt-, Lot- und Parallelenabstände – als editierbare Vektoren.",
            },
            {
              icon: I.table,
              t: "Analyse & Export",
              d: "Snap-to-Edge, Schwellenwert-Zählung, Kantenhervorhebung. Export als CSV/Excel-Tabelle und bemaßtes Bild mit Maßstabsleiste.",
            },
          ].map((f) => (
            <div key={f.t} className="bg-ink-900 p-5">
              <span className="text-accent-400">
                <f.icon size={18} />
              </span>
              <p className="mt-2.5 text-[13px] font-semibold text-mist-100">{f.t}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist-500">{f.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
