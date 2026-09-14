import { useStore } from "@/store";
import { Tool } from "@/lib/types";
import { I, IconComp } from "./Icons";

interface Entry {
  id: Tool;
  icon: IconComp;
  label: string;
  key?: string;
}

const GROUPS: { title: string; items: Entry[] }[] = [
  {
    title: "Navigieren",
    items: [
      { id: "select", icon: "select", label: "Auswählen & Verschieben", key: "V" },
      { id: "pan", icon: "pan", label: "Bild verschieben", key: "H" },
    ],
  },
  {
    title: "Kalibrierung",
    items: [
      { id: "calib2", icon: "calib2", label: "Referenzmaß · 2 Punkte", key: "1" },
      { id: "calib4", icon: "calib4", label: "Perspektive entzerren · 4 Punkte", key: "2" },
    ],
  },
  {
    title: "Messen",
    items: [
      { id: "line", icon: "line", label: "Strecke / Distanz", key: "L" },
      { id: "polyline", icon: "polyline", label: "Polylinie (Gesamtlänge)", key: "P" },
      { id: "polygon", icon: "polygon", label: "Polygon · Fläche & Umfang", key: "G" },
      { id: "rect", icon: "rect", label: "Rechteck", key: "R" },
      { id: "ellipse", icon: "ellipse", label: "Ellipse (Mittelpunkt, 2 Ränder)", key: "E" },
      { id: "circle", icon: "circle3", label: "Kreis aus 3 Punkten", key: "C" },
      { id: "angle", icon: "angle", label: "Winkel (3 Punkte)", key: "W" },
      { id: "lineangle", icon: "lineangle", label: "Schnittwinkel zweier Linien", key: "X" },
      { id: "lot", icon: "lot", label: "Lot · Abstand Punkt zu Linie", key: "D" },
      { id: "parallel", icon: "parallel", label: "Abstand paralleler Linien", key: "M" },
    ],
  },
  {
    title: "Markieren",
    items: [
      { id: "marker", icon: "marker", label: "Marker · Objekte zählen", key: "N" },
      { id: "text", icon: "text", label: "Textfeld einfügen", key: "T" },
      { id: "arrow", icon: "arrow", label: "Pfeil / Kennzeichnung", key: "Y" },
    ],
  },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);

  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-ink-700 bg-ink-900 py-2">
      {GROUPS.map((g, gi) => (
        <div key={g.title} className="flex w-full flex-col items-center">
          {gi > 0 && <div className="my-2 h-px w-8 bg-ink-700" />}
          {g.items.map((it) => {
            const active = tool === it.id;
            const Icon = I[it.icon];
            return (
              <button
                key={it.id}
                onClick={() => setTool(it.id)}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                  active
                    ? "bg-accent-500/15 text-accent-400"
                    : "text-mist-400 hover:bg-ink-750 hover:text-mist-100"
                }`}
                aria-label={it.label}
              >
                {active && (
                  <span className="absolute -left-2 top-2 h-6 w-0.5 rounded-full bg-accent-400" />
                )}
                <Icon size={19} />
                <span className="pointer-events-none absolute left-12 z-40 hidden whitespace-nowrap rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11px] font-medium text-mist-100 shadow-xl group-hover:block">
                  {it.label}
                  {it.key && (
                    <kbd className="ml-2 rounded border border-ink-600 bg-ink-950 px-1 font-mono text-[10px] text-mist-400">
                      {it.key}
                    </kbd>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
