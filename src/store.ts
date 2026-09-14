import { create } from "zustand";
import {
  Calibration,
  CountConfig,
  CountResult,
  DEFAULT_ADJ,
  Measurement,
  PendingCalib,
  Pt,
  Tool,
  UnitId,
  Adjustments,
  uid,
  nextColor,
  TYPE_LABEL,
} from "./lib/types";
import { minPoints } from "./lib/geometry";

export interface PersistShape {
  name: string;
  calibrations: Calibration[];
  activeCalId: string | null;
  displayUnit: UnitId;
  measurements: Measurement[];
  adjustments: Adjustments;
  snapOn: boolean;
  snapRadius: number;
  snapStrength: number;
  edgesOn: boolean;
  scalebar: boolean;
  countCfg: CountConfig;
  countResult: CountResult | null;
  showNumbers: boolean;
}

interface StoreState extends PersistShape {
  ready: boolean;
  projectId: string | null;
  width: number;
  height: number;
  tool: Tool;
  selectedId: string | null;
  draft: Pt[];
  pendingCalib: PendingCalib | null;

  init: (doc: PersistShape, projectId: string, width: number, height: number) => void;
  setTool: (t: Tool) => void;
  addDraftPoint: (p: Pt) => void;
  popDraft: () => void;
  cancelDraft: () => void;
  commitDraft: (text?: string) => void;
  select: (id: string | null) => void;
  updatePoints: (id: string, pts: Pt[]) => void;
  moveSelection: (dx: number, dy: number) => void;
  removeSelected: () => void;
  updateMeasurement: (id: string, patch: Partial<Measurement>) => void;
  addCalibration: (cal: Calibration) => void;
  removeCalibration: (id: string) => void;
  setActiveCal: (id: string | null) => void;
  patch: (p: Partial<PersistShape>) => void;
}

let saveFn: ((doc: PersistShape) => void) | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSave = 0;

export function setSaveHandler(fn: ((doc: PersistShape) => void) | null) {
  saveFn = fn;
}

function persistKeys(s: StoreState): PersistShape {
  return {
    name: s.name,
    calibrations: s.calibrations,
    activeCalId: s.activeCalId,
    displayUnit: s.displayUnit,
    measurements: s.measurements,
    adjustments: s.adjustments,
    snapOn: s.snapOn,
    snapRadius: s.snapRadius,
    snapStrength: s.snapStrength,
    edgesOn: s.edgesOn,
    scalebar: s.scalebar,
    countCfg: s.countCfg,
    countResult: s.countResult
      ? { ...s.countResult, items: s.countResult.items.slice(0, 300) }
      : null,
    showNumbers: s.showNumbers,
  };
}

export function scheduleSave(get: () => StoreState) {
  if (!saveFn) return;
  const now = Date.now();
  const fn = saveFn;
  const doc = persistKeys(get());
  if (saveTimer) clearTimeout(saveTimer);
  // Kleine Pausen (z. B. beim Ziehen von Punkten) nicht speichern
  if (now - lastSave < 400) {
    saveTimer = setTimeout(() => {
      lastSave = Date.now();
      fn(persistKeys(get()));
    }, 500);
  } else {
    lastSave = now;
    fn(doc);
  }
}

export const useStore = create<StoreState>((set, get) => ({
  ready: false,
  projectId: null,
  width: 0,
  height: 0,
  name: "",
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
  tool: "select",
  selectedId: null,
  draft: [],
  pendingCalib: null,

  init: (doc, projectId, width, height) => {
    set({
      ...doc,
      ready: true,
      projectId,
      width,
      height,
      tool: "select",
      selectedId: null,
      draft: [],
      pendingCalib: null,
    });
    scheduleSave(get);
  },

  setTool: (t) => set({ tool: t, draft: [], pendingCalib: null, selectedId: null }),

  addDraftPoint: (p) => {
    const { tool } = get();
    const maxPts: Record<string, number> = {
      calib2: 2,
      calib4: 4,
      line: 2,
      rect: 2,
      arrow: 2,
      ellipse: 3,
      circle: 3,
      angle: 3,
      lot: 3,
      lineangle: 4,
      parallel: 4,
      marker: 1,
      text: 1,
    };
    const max = maxPts[tool] ?? Infinity;
    if (max !== 1) set({ draft: [...get().draft, p] });
    else {
      // Ein-Punkt-Tools (Marker) sofort committen
      set({ draft: [p] });
      get().commitDraft();
    }
  },

  popDraft: () => set({ draft: get().draft.slice(0, -1) }),
  cancelDraft: () => set({ draft: [], pendingCalib: null }),

  commitDraft: (text) => {
    const s = get();
    const { tool, draft } = s;
    if (tool === "calib2" || tool === "calib4") {
      const kind = tool === "calib2" ? "reference" : "perspective";
      const need = tool === "calib2" ? 2 : 4;
      if (draft.length >= need) {
        set({
          pendingCalib: { kind, points: draft.slice(0, need) },
          draft: [],
          tool: "select",
        });
      }
      return;
    }
    if (minPoints(tool) > draft.length) return;
    const count = s.measurements.filter((m) => m.type === tool).length + 1;
    const m: Measurement = {
      id: uid(),
      type: tool as Measurement["type"],
      name: `${TYPE_LABEL[tool as Measurement["type"]]} ${count}`,
      color: nextColor(s.measurements),
      visible: true,
      points: draft,
      ...(tool === "text" ? { text: text || "Text", size: 16 } : {}),
    };
    set({ measurements: [...s.measurements, m], draft: [], selectedId: tool === "select" ? null : m.id });
    scheduleSave(get);
  },

  select: (id) => set({ selectedId: id }),

  updatePoints: (id, pts) => {
    set({
      measurements: get().measurements.map((m) => (m.id === id ? { ...m, points: pts } : m)),
    });
    scheduleSave(get);
  },

  moveSelection: (dx, dy) => {
    const id = get().selectedId;
    if (!id) return;
    set({
      measurements: get().measurements.map((m) =>
        m.id === id
          ? { ...m, points: m.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
          : m
      ),
    });
    scheduleSave(get);
  },

  removeSelected: () => {
    const id = get().selectedId;
    if (!id) return;
    set({
      measurements: get().measurements.filter((m) => m.id !== id),
      selectedId: null,
    });
    scheduleSave(get);
  },

  updateMeasurement: (id, patch) => {
    set({
      measurements: get().measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
    scheduleSave(get);
  },

  addCalibration: (cal) => {
    set({
      calibrations: [...get().calibrations, cal],
      activeCalId: cal.id,
      pendingCalib: null,
    });
    scheduleSave(get);
  },

  removeCalibration: (id) => {
    const s = get();
    const calibrations = s.calibrations.filter((c) => c.id !== id);
    set({
      calibrations,
      activeCalId: s.activeCalId === id ? (calibrations[0]?.id ?? null) : s.activeCalId,
    });
    scheduleSave(get);
  },

  setActiveCal: (id) => {
    set({ activeCalId: id });
    scheduleSave(get);
  },

  patch: (p) => {
    set(p);
    scheduleSave(get);
  },
}));

/* Leichte UI-Store für Statusleiste (Kursor, Zoom) */
interface UiState {
  cursor: Pt | null;
  zoom: number;
  hint: string;
  set: (p: Partial<UiState>) => void;
}
export const useUi = create<UiState>((set) => ({
  cursor: null,
  zoom: 1,
  hint: "",
  set: (p) => set(p),
}));
