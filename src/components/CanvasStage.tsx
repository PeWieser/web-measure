import { useCallback, useEffect, useRef, useState } from "react";
import { useStore, useUi } from "@/store";
import { Pt, Tool } from "@/lib/types";
import { mmPerPx, minPoints, dist, pointLineFoot, circle3 } from "@/lib/geometry";
import {
  adjNeedsRebuild,
  makeAnalysisCanvas,
  rebuildWorking,
  snapEdge,
  sobelOverlay,
  warpPerspective,
} from "@/lib/imageproc";
import { drawScene, drawScalebarScreen, niceScalebar, filterString } from "@/lib/render";
import { getAnalysis, setAnalysis, setBitmap, setWarped as setSessionWarped, onViewCmd } from "@/lib/session";
import { I } from "./Icons";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function ptSegDist(p: Pt, a: Pt, b: Pt): number {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const l2 = ax * ax + ay * ay;
  if (l2 < 1e-9) return dist(p, a);
  const t = clamp(((p.x - a.x) * ax + (p.y - a.y) * ay) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + t * ax), p.y - (a.y + t * ay));
}

interface DragState {
  mode: "pan" | "handle" | "move";
  lastClientX: number;
  lastClientY: number;
  idx?: number;
  mId?: string;
  lastPt?: Pt;
  pts0?: Pt[];
}

export default function CanvasStage({ bitmap }: { bitmap: ImageBitmap }) {
  const s = useStore();
  const {
    width,
    height,
    tool,
    draft,
    measurements,
    selectedId,
    calibrations,
    activeCalId,
    pendingCalib,
    adjustments,
    displayUnit,
    snapOn,
    snapRadius,
    snapStrength,
    edgesOn,
    scalebar,
    countResult,
    showNumbers,
  } = s;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef({ zoom: 0.5, x: 40, y: 40 });
  const cursorRef = useRef<Pt | null>(null);
  const snapRef = useRef<Pt | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const rafRef = useRef(0);
  const fittedRef = useRef(false);

  const [working, setWorking] = useState<HTMLCanvasElement | null>(null);
  const [warped, setWarped] = useState<HTMLCanvasElement | null>(null);
  const [warping, setWarping] = useState(false);
  const [edges, setEdges] = useState<HTMLCanvasElement | null>(null);
  const [textEdit, setTextEdit] = useState<{ pt: Pt } | null>(null);
  const warpedForRef = useRef<string | null>(null);

  const cal = calibrations.find((c) => c.id === activeCalId) ?? null;
  const mpp = mmPerPx(cal, width);

  /* ---------------- Rendering ---------------- */

  const drawNowRef = useRef<() => void>(() => {});
  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawNowRef.current();
    });
  }, []);

  const drawNow = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
    }
    const ctx = canvas.getContext("2d")!;
    const v = viewRef.current;
    const st = useStore.getState();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0, 0, cw, ch);
    // Punktraster im Rand
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    const gs = 26;
    for (let x = (v.x % gs + gs) % gs; x < cw; x += gs) {
      for (let y = (v.y % gs + gs) % gs; y < ch; y += gs) {
        ctx.fillRect(x, y, 1, 1);
      }
    }

    const c2 = st.calibrations.find((c) => c.id === st.activeCalId) ?? null;
    const mppNow = mmPerPx(c2, st.width);
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.scale(v.zoom, v.zoom);
    const src = warped ?? working ?? bitmap;
    drawScene(ctx, {
      source: src,
      W: st.width,
      H: st.height,
      filter: filterString(st.adjustments),
      edges,
      measurements: st.measurements,
      selectedId: st.selectedId,
      mpp: mppNow,
      unit: st.displayUnit,
      zoom: v.zoom,
      draft:
        st.tool !== "select" && st.tool !== "pan"
          ? { type: st.tool, points: st.draft, cursor: cursorRef.current }
          : null,
      snapPoint: snapRef.current,
      pendingCalib: st.pendingCalib,
      countItems: st.countResult?.items ?? null,
      showNumbers: st.showNumbers,
    });
    ctx.restore();

    if (st.scalebar) {
      const sb = niceScalebar(mppNow, st.displayUnit, 170);
      if (sb) drawScalebarScreen(ctx, sb, 16, ch - 16, dpr);
    }
  }, [bitmap, working, warped, edges]);

  drawNowRef.current = drawNow;

  useEffect(() => {
    requestDraw();
  }, [
    requestDraw,
    measurements,
    selectedId,
    draft,
    pendingCalib,
    displayUnit,
    scalebar,
    showNumbers,
    adjustments,
    activeCalId,
    countResult,
  ]);

  /* ---------------- Init: Fit + Analyse-Canvas ---------------- */

  useEffect(() => {
    setBitmap(bitmap);
    const an = makeAnalysisCanvas(bitmap);
    setAnalysis(an);
    if (!fittedRef.current) {
      fittedRef.current = true;
      const wrap = wrapRef.current;
      if (wrap) {
        const zoom = Math.min(
          (wrap.clientWidth - 90) / bitmap.width,
          (wrap.clientHeight - 90) / bitmap.height
        );
        viewRef.current = {
          zoom: clamp(zoom, 0.01, 4),
          x: (wrap.clientWidth - bitmap.width * zoom) / 2,
          y: (wrap.clientHeight - bitmap.height * zoom) / 2,
        };
        useUi.getState().set({ zoom: viewRef.current.zoom });
      }
    }
    requestDraw();
    return () => {
      setBitmap(null);
      setAnalysis(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap]);

  useEffect(() => {
    const ro = new ResizeObserver(() => requestDraw());
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [requestDraw]);

  /* ---------------- Arbeitscanvas (Gamma / Schärfen) ---------------- */

  useEffect(() => {
    if (!adjNeedsRebuild(adjustments)) {
      setWorking(null);
      return;
    }
    let cancel = false;
    const t = setTimeout(() => {
      if (cancel) return;
      const c = rebuildWorking(bitmap, adjustments);
      if (!cancel) setWorking(c);
    }, 240);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [bitmap, adjustments]);

  /* ---------------- Perspektiven-Entzerrung ---------------- */

  useEffect(() => {
    let cancel = false;
    if (cal?.kind === "perspective" && cal.persp) {
      const key = cal.id + cal.persp.homography.join(",");
      if (warpedForRef.current === key && warped) {
        setWarping(false);
        return;
      }
      setWarping(true);
      setWarped(null);
      warpedForRef.current = null;
      setTimeout(async () => {
        try {
          const c = await warpPerspective(bitmap, cal.persp!.homography);
          if (cancel) return;
          setWarped(c);
          warpedForRef.current = key;
          setSessionWarped(c);
        } finally {
          if (!cancel) setWarping(false);
        }
      }, 30);
    } else {
      warpedForRef.current = null;
      setWarped(null);
      setSessionWarped(null);
      setWarping(false);
    }
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitmap, activeCalId, cal?.id]);

  /* ---------------- Kanten-Overlay ---------------- */

  useEffect(() => {
    if (!edgesOn) {
      setEdges(null);
      return;
    }
    let cancel = false;
    const t = setTimeout(() => {
      const an = getAnalysis();
      if (!an || cancel) return;
      setEdges(sobelOverlay(an.canvas));
    }, 120);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [edgesOn, bitmap]);

  /* ---------------- View-Befehle aus der TopBar ---------------- */

  const fitView = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const st = useStore.getState();
    const zoom = Math.min(
      (wrap.clientWidth - 90) / st.width,
      (wrap.clientHeight - 90) / st.height
    );
    viewRef.current = {
      zoom: clamp(zoom, 0.01, 4),
      x: (wrap.clientWidth - st.width * zoom) / 2,
      y: (wrap.clientHeight - st.height * zoom) / 2,
    };
    useUi.getState().set({ zoom: viewRef.current.zoom });
    requestDraw();
  }, [requestDraw]);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const v = viewRef.current;
      const nz = clamp(v.zoom * factor, 0.015, 64);
      const f = nz / v.zoom;
      v.x = cx - (cx - v.x) * f;
      v.y = cy - (cy - v.y) * f;
      v.zoom = nz;
      useUi.getState().set({ zoom: nz });
      requestDraw();
    },
    [requestDraw]
  );

  useEffect(() => {
    const off = onViewCmd((c) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      if (c.type === "zoomIn") zoomAt(r.width / 2, r.height / 2, 1.3);
      else if (c.type === "zoomOut") zoomAt(r.width / 2, r.height / 2, 1 / 1.3);
      else if (c.type === "fit") fitView();
      else if (c.type === "oneOne") {
        const v = viewRef.current;
        const f = 1 / v.zoom;
        v.x = r.width / 2 - (r.width / 2 - v.x) * f;
        v.y = r.height / 2 - (r.height / 2 - v.y) * f;
        v.zoom = 1;
        useUi.getState().set({ zoom: 1 });
        requestDraw();
      }
    });
    return off;
  }, [zoomAt, fitView, requestDraw]);

  /* ---------------- Maus: Wheel-Zoom (passive:false) ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.pow(1.0016, -e.deltaY));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ---------------- Koordinaten & Snap ---------------- */

  const toImage = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom };
  };

  const applySnap = (p: Pt): Pt => {
    if (!snapOn || (cal?.kind === "perspective")) return p;
    const an = getAnalysis();
    if (!an) return p;
    const sp = snapEdge(an.canvas, an.k, p.x, p.y, snapRadius, snapStrength);
    if (sp && dist(sp, p) <= snapRadius * 1.5) {
      snapRef.current = sp;
      return sp;
    }
    snapRef.current = null;
    return p;
  };

  /* ---------------- Hit-Testing ---------------- */

  const hitTest = (p: Pt): { mId: string; idx: number | null } | null => {
    const v = viewRef.current;
    const tol = Math.max(5 / v.zoom, 4);
    const st = useStore.getState();
    // erst Handles der Auswahl
    const sel = st.measurements.find((m) => m.id === st.selectedId);
    if (sel && sel.visible) {
      for (let i = 0; i < sel.points.length; i++) {
        if (dist(p, sel.points[i]) < tol * 1.4) return { mId: sel.id, idx: i };
      }
    }
    for (let i = st.measurements.length - 1; i >= 0; i--) {
      const m = st.measurements[i];
      if (!m.visible) continue;
      const d = m.points;
      const P = (n: number) => d[n] ?? { x: 0, y: 0 };
      const segHit = (a: Pt, b: Pt, t = tol) => ptSegDist(p, a, b) < t;
      let hit = false;
      switch (m.type) {
        case "line":
        case "arrow":
          hit = d.length >= 2 && segHit(P(0), P(1));
          break;
        case "polyline":
          hit = false;
          for (let j = 0; j + 1 < d.length; j++) if (segHit(d[j], d[j + 1])) hit = true;
          break;
        case "polygon":
          hit = false;
          for (let j = 0; j + 1 < d.length; j++) if (segHit(d[j], d[j + 1])) hit = true;
          if (d.length >= 3 && segHit(d[d.length - 1], d[0])) hit = true;
          break;
        case "rect":
          hit =
            d.length >= 2 &&
            (segHit({ x: Math.min(P(0).x, P(1).x), y: P(0).y }, { x: Math.max(P(0).x, P(1).x), y: P(0).y }) ||
              segHit({ x: Math.min(P(0).x, P(1).x), y: P(1).y }, { x: Math.max(P(0).x, P(1).x), y: P(1).y }) ||
              segHit({ x: P(0).x, y: Math.min(P(0).y, P(1).y) }, { x: P(0).x, y: Math.max(P(0).y, P(1).y) }) ||
              segHit({ x: P(1).x, y: Math.min(P(0).y, P(1).y) }, { x: P(1).x, y: Math.max(P(0).y, P(1).y) }));
          break;
        case "ellipse": {
          if (d.length >= 3) {
            const a = Math.max(Math.abs(P(1).x - P(0).x), 1);
            const b = Math.max(Math.abs(P(2).y - P(0).y), 1);
            const dx = (p.x - P(0).x) / a;
            const dy = (p.y - P(0).y) / b;
            hit = Math.abs(Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(a, b) < tol * 1.6;
          }
          break;
        }
        case "circle": {
          if (d.length >= 3) {
            const c = circle3(P(0), P(1), P(2));
            if (c) hit = Math.abs(dist(p, c.center) - c.r) < tol * 1.6;
          }
          break;
        }
        case "angle":
          hit = d.length >= 3 && (segHit(P(0), P(1)) || segHit(P(1), P(2)));
          break;
        case "lineangle":
          hit = d.length >= 4 && (segHit(P(0), P(1)) || segHit(P(2), P(3)));
          break;
        case "lot":
          hit = d.length >= 3 && (segHit(P(0), P(1)) || segHit(P(2), pointLineFoot(P(2), P(0), P(1))));
          break;
        case "parallel":
          hit =
            d.length >= 4 &&
            (segHit(P(0), P(1)) ||
              segHit(P(2), P(3)) ||
              segHit(pointLineFoot({ x: (P(0).x + P(1).x) / 2, y: (P(0).y + P(1).y) / 2 }, P(2), P(3)), pointLineFoot({ x: (P(2).x + P(3).x) / 2, y: (P(2).y + P(3).y) / 2 }, P(0), P(1))));
          break;
        case "marker":
          hit = d.length >= 1 && dist(p, P(0)) < Math.max(tol * 1.5, 11 / v.zoom + tol);
          break;
        case "text": {
          if (d.length >= 1) {
            const fs = (m.size ?? 16) / v.zoom;
            const tw = (m.text?.length ?? 3) * fs * 0.6;
            const x0 = Math.min(P(0).x, p.x);
            hit =
              p.x > P(0).x - 8 / v.zoom &&
              p.x < P(0).x + tw + 8 / v.zoom &&
              p.y > P(0).y - fs - 8 / v.zoom &&
              p.y < P(0).y + 8 / v.zoom;
            void x0;
          }
          break;
        }
      }
      if (hit) return { mId: m.id, idx: null };
    }
    return null;
  };

  /* ---------------- Pointer-Events ---------------- */

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    e.preventDefault();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const p = toImage(e);
    const st = useStore.getState();

    if (e.button === 1 || spaceRef.current || st.tool === "pan") {
      dragRef.current = { mode: "pan", lastClientX: e.clientX, lastClientY: e.clientY };
      return;
    }

    if (st.tool === "select") {
      const hit = hitTest(p);
      if (hit) {
        st.select(hit.mId);
        if (hit.idx !== null) {
          const m = st.measurements.find((x) => x.id === hit.mId)!;
          dragRef.current = {
            mode: "handle",
            lastClientX: e.clientX,
            lastClientY: e.clientY,
            idx: hit.idx,
            mId: hit.mId,
            pts0: m.points.map((q) => ({ ...q })),
          };
        } else {
          dragRef.current = { mode: "move", lastClientX: e.clientX, lastClientY: e.clientY, mId: hit.mId, lastPt: p };
        }
        requestDraw();
      } else {
        st.select(null);
        requestDraw();
      }
      return;
    }

    // Draft-Tools
    if (st.tool === "text") {
      const pt = p;
      useStore.setState({ draft: [pt] });
      setTextEdit({ pt });
      requestDraw();
      return;
    }
    const sp = applySnap(p);
    st.addDraftPoint(sp);
    requestDraw();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toImage(e);
    cursorRef.current = p;
    const v = viewRef.current;
    const tol = 5 / v.zoom;

    useUi.getState().set({ cursor: { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 } });

    const drag = dragRef.current;
    if (drag) {
      if (drag.mode === "pan") {
        v.x += e.clientX - drag.lastClientX;
        v.y += e.clientY - drag.lastClientY;
        drag.lastClientX = e.clientX;
        drag.lastClientY = e.clientY;
        requestDraw();
        return;
      }
      if (drag.mode === "handle" && drag.mId && drag.idx !== undefined) {
        const sp = applySnap(p);
        const pts = useStore.getState().measurements.find((m) => m.id === drag.mId)?.points ?? [];
        if (pts.length > drag.idx) {
          const next = pts.map((q, i) => (i === drag.idx ? sp : q));
          useStore.getState().updatePoints(drag.mId, next);
        }
        requestDraw();
        return;
      }
      if (drag.mode === "move" && drag.lastPt) {
        const sp = p;
        useStore.getState().moveSelection(sp.x - drag.lastPt.x, sp.y - drag.lastPt.y);
        drag.lastPt = sp;
        requestDraw();
        return;
      }
    }

    // Snap-Vorschau für Draft-Tools
    if (
      !drag &&
      useStore.getState().tool !== "select" &&
      useStore.getState().tool !== "pan" &&
      useStore.getState().tool !== "text"
    ) {
      applySnap(p);
      requestDraw();
    }
    void tol;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    dragRef.current = null;
    snapRef.current = null;
    requestDraw();
  };

  const onDoubleClick = () => {
    const st = useStore.getState();
    if (st.draft.length >= minPoints(st.tool)) st.commitDraft();
  };

  /* ---------------- Tastatur ---------------- */

  useEffect(() => {
    const TOOLS: Record<string, Tool> = {
      v: "select",
      h: "pan",
      "1": "calib2",
      "2": "calib4",
      l: "line",
      p: "polyline",
      g: "polygon",
      r: "rect",
      e: "ellipse",
      c: "circle",
      w: "angle",
      x: "lineangle",
      d: "lot",
      m: "parallel",
      n: "marker",
      t: "text",
      y: "arrow",
    };
    const isTyping = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (e.code === "Space") {
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (k === "enter") {
        const st = useStore.getState();
        if (textEdit) return;
        if (st.draft.length > 0 && st.draft.length >= minPoints(st.tool)) st.commitDraft();
        return;
      }
      if (k === "escape") {
        if (textEdit) {
          setTextEdit(null);
          useStore.setState({ draft: [] });
        } else if (useStore.getState().draft.length > 0 || useStore.getState().pendingCalib) {
          useStore.getState().cancelDraft();
        } else {
          useStore.getState().select(null);
        }
        return;
      }
      if (k === "backspace" || k === "delete") {
        const st = useStore.getState();
        if (st.draft.length > 0) st.popDraft();
        else st.removeSelected();
        return;
      }
      if (k === "f") {
        fitView();
        return;
      }
      if (k === "+" || k === "=") {
        const wrap = wrapRef.current;
        if (wrap) zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, 1.3);
        return;
      }
      if (k === "-") {
        const wrap = wrapRef.current;
        if (wrap) zoomAt(wrap.clientWidth / 2, wrap.clientHeight / 2, 1 / 1.3);
        return;
      }
      if (TOOLS[k]) useStore.getState().setTool(TOOLS[k]);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fitView, zoomAt, textEdit]);

  /* ---------------- Text-Editor-Overlay ---------------- */

  const confirmText = (value: string) => {
    if (value.trim()) s.commitDraft(value.trim());
    else useStore.setState({ draft: [] });
    setTextEdit(null);
  };

  /* ---------------- Draft-Hinweis ---------------- */

  const draftHint = (() => {
    if (textEdit) return null;
    if (pendingCalib) return null;
    if (tool === "select") return null;
    if (tool === "pan") return "Bild verschieben · Mausrad zum Zoomen";
    const need = tool === "calib4" ? 4 : tool === "calib2" ? 2 : minPoints(tool);
    const n = tool === "marker" ? 1 : tool === "text" ? 1 : draft.length;
    const name: Record<string, string> = {
      calib2: "Referenzmaß",
      calib4: "Perspektive",
      line: "Strecke",
      polyline: "Polylinie",
      polygon: "Polygon",
      rect: "Rechteck",
      ellipse: "Ellipse",
      circle: "Kreis",
      angle: "Winkel",
      lineangle: "Schnittwinkel",
      lot: "Lot",
      parallel: "Parallelen",
      marker: "Marker",
      text: "Text",
      arrow: "Pfeil",
    };
    if (need > 1)
      return `${name[tool]}: Punkt ${Math.min(n + 1, need)} von ${need} · Enter = bestätigen · Esc = abbrechen · Entf = letzten Punkt löschen`;
    return `${name[tool]}: klicken zum Setzen · Esc = beenden`;
  })();

  const isDraftTool = tool !== "select" && tool !== "pan";
  const cursorCls =
    tool === "pan" || spaceRef.current ? "cursor-grab" : isDraftTool ? "cursor-crosshair" : "cursor-default";

  return (
    <div ref={wrapRef} className={`relative min-w-0 flex-1 overflow-hidden bg-ink-950 ${cursorCls}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        className="block touch-none"
      />

      {/* Draft-Hinweis */}
      {draftHint && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-900/95 px-3.5 py-1.5 text-[11.5px] font-medium text-mist-200 shadow-xl">
          {draftHint}
        </div>
      )}

      {/* Entzerrungs-Ladezustand */}
      {warping && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg border border-ink-600 bg-ink-900/95 px-6 py-5 shadow-2xl">
          <svg width="28" height="28" viewBox="0 0 28 28" className="animate-spin text-accent-400">
            <circle cx="14" cy="14" r="11" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" fill="none" />
            <path d="M14 3a11 11 0 0 1 11 11" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <p className="text-[12.5px] font-medium text-mist-200">Perspektive wird entzerrt …</p>
        </div>
      )}

      {/* Text-Eingabe */}
      {textEdit && (
        <input
          autoFocus
          defaultValue=""
          placeholder="Text eingeben …"
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmText((e.target as HTMLInputElement).value);
            if (e.key === "Escape") {
              setTextEdit(null);
              useStore.setState({ draft: [] });
            }
          }}
          onBlur={(e) => confirmText(e.target.value)}
          className="absolute z-30 w-56 -translate-x-1 -translate-y-full rounded-md border border-accent-500/70 bg-ink-950/95 px-2.5 py-1.5 text-[13px] font-semibold text-mist-100 shadow-2xl outline-none"
          style={{
            left: viewRef.current.x + textEdit.pt.x * viewRef.current.zoom,
            top: viewRef.current.y + textEdit.pt.y * viewRef.current.zoom,
          }}
        />
      )}

      {/* Hinweis ohne Kalibrierung */}
      {mpp === null && !warping && (
        <button
          onClick={() => useStore.getState().setTool("calib2")}
          className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-accent-500/40 bg-ink-900/95 px-3 py-1.5 text-[11.5px] text-accent-400 shadow-xl transition-colors hover:bg-accent-500/10"
        >
          <I.warn size={14} />
          Noch nicht kalibriert – Messwerte in px. Jetzt Referenzmaß setzen?
        </button>
      )}
    </div>
  );
}
