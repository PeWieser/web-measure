"use client";

import { useEffect, useState } from "react";
import { useStore, setSaveHandler, PersistShape } from "@/store";
import { useSave } from "@/lib/session";
import { DEFAULT_ADJ } from "@/lib/types";
import TopBar from "@/components/TopBar";
import Toolbar from "@/components/Toolbar";
import SidePanel from "@/components/SidePanel";
import StatusBar from "@/components/StatusBar";
import CanvasStage from "@/components/CanvasStage";
import { I } from "@/components/Icons";

function defaultDoc(): PersistShape {
  return {
    name: "Projekt",
    calibrations: [],
    activeCalId: null,
    displayUnit: "mm",
    measurements: [],
    adjustments: { ...DEFAULT_ADJ },
    snapOn: true,
    snapRadius: 24,
    snapStrength: 26,
    edgesOn: false,
    scalebar: true,
    countCfg: { threshold: 128, invert: false, minArea: 6 },
    countResult: null,
    showNumbers: true,
  };
}

export default function Workspace({ id }: { id: string }) {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [bitmap, setBitmapState] = useState<ImageBitmap | null>(null);

  useEffect(() => {
    let closed = false;
    let bmp: ImageBitmap | null = null;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) throw new Error("not found");
        const proj = await res.json();
        const imgRes = await fetch(`/api/projects/${id}/image`);
        if (!imgRes.ok) throw new Error("image not found");
        const blob = await imgRes.blob();
        bmp = await createImageBitmap(blob);
        if (closed) {
          bmp.close();
          return;
        }
        const d = (proj.data ?? {}) as Partial<PersistShape>;
        const base = defaultDoc();
        useStore.getState().init(
          {
            ...base,
            name: proj.name,
            calibrations: d.calibrations ?? [],
            activeCalId: d.activeCalId ?? null,
            displayUnit: d.displayUnit ?? "mm",
            measurements: d.measurements ?? [],
            adjustments: { ...DEFAULT_ADJ, ...(d.adjustments ?? {}) },
            snapOn: d.snapOn ?? true,
            snapRadius: d.snapRadius ?? 24,
            snapStrength: d.snapStrength ?? 26,
            edgesOn: d.edgesOn ?? false,
            scalebar: d.scalebar ?? true,
            countCfg: { threshold: 128, invert: false, minArea: 6, ...(d.countCfg ?? {}) },
            countResult: d.countResult ?? null,
            showNumbers: d.showNumbers ?? true,
          },
          id,
          proj.width,
          proj.height
        );
        setBitmapState(bmp);
        setPhase("ready");
      } catch {
        if (!closed) setPhase("error");
      }
    })();
    return () => {
      closed = true;
      setSaveHandler(null);
      bmp?.close();
    };
  }, [id]);

  useEffect(() => {
    if (phase !== "ready") return;
    setSaveHandler((doc) => {
      useSave.setState({ state: "saving" });
      fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: doc.name, data: doc }),
      })
        .then((r) => useSave.setState({ state: r.ok ? "saved" : "error" }))
        .catch(() => useSave.setState({ state: "error" }));
    });
  }, [phase, id]);

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-950">
        <svg width="30" height="30" viewBox="0 0 28 28" className="animate-spin text-accent-400">
          <circle cx="14" cy="14" r="11" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
          <path d="M14 3a11 11 0 0 1 11 11" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
        </svg>
        <p className="text-[13px] text-mist-400">Projekt wird geladen …</p>
      </div>
    );
  }

  if (phase === "error" || !bitmap) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 px-6 text-center">
        <span className="text-bad-500">
          <I.warn size={30} />
        </span>
        <p className="text-[15px] font-medium text-mist-200">Projekt konnte nicht geladen werden.</p>
        <p className="text-[13px] text-mist-500">Es existiert möglicherweise nicht mehr.</p>
        <a
          href="/"
          className="rounded-md border border-ink-600 bg-ink-850 px-4 py-2 text-[13px] font-medium text-mist-200 hover:border-ink-500"
        >
          Zur Übersicht
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-ink-950">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Toolbar />
        <CanvasStage bitmap={bitmap} />
        <SidePanel />
      </div>
      <StatusBar />
    </div>
  );
}
