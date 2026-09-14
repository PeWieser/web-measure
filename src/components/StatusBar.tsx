import { useStore, useUi } from "@/store";
import { mmPerPx } from "@/lib/geometry";

export default function StatusBar() {
  const cursor = useUi((s) => s.cursor);
  const zoom = useUi((s) => s.zoom);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const displayUnit = useStore((s) => s.displayUnit);
  const tool = useStore((s) => s.tool);
  const calibrations = useStore((s) => s.calibrations);
  const activeCalId = useStore((s) => s.activeCalId);
  const mpp = mmPerPx(calibrations.find((c) => c.id === activeCalId) ?? null, width);

  const toolName: Record<string, string> = {
    select: "Auswählen – Punkte per Hand anfassbar",
    pan: "Schieben",
    calib2: "Referenzmaß – 2 Punkte eines bekannten Abstands",
    calib4: "Perspektive – 4 Eckpunkte der Ebene (im Uhrzeigersinn)",
    line: "Strecke – 2 Punkte",
    polyline: "Polylinie – Punkte setzen, Enter zum Schließen",
    polygon: "Polygon – mind. 3 Punkte, Enter zum Schließen",
    rect: "Rechteck – 2 Ecken diagonal",
    ellipse: "Ellipse – 1. Mittelpunkt, 2. Ränderpunkt rechts, 3. Ränderpunkt unten",
    circle: "Kreis – 3 Punkte auf dem Umfang",
    angle: "Winkel – 1. Arm, 2. Scheitel, 3. Arm",
    lineangle: "Schnittwinkel – 2 Punkte je Linie",
    lot: "Lot – 2 Punkte der Linie, dann der Abstandspunkt",
    parallel: "Parallelen – 2 Punkte je Linie",
    marker: "Marker – Objekte nacheinander markieren",
    text: "Text – klicken und Text eingeben",
    arrow: "Pfeil – Start und Ziel",
  };

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-ink-700 bg-ink-900 px-3 font-mono text-[10.5px] text-mist-500">
      <span className="w-44">
        {cursor ? `X ${cursor.x.toLocaleString("de-DE")} · Y ${cursor.y.toLocaleString("de-DE")} px` : "X – · Y –"}
      </span>
      <span className="w-32 text-mist-600">
        {width} × {height} px
      </span>
      <span className="hidden min-w-0 flex-1 truncate font-sans text-[11px] text-mist-600 md:block">
        {toolName[tool]}
      </span>
      <span className="ml-auto">{Math.round(zoom * 100)} %</span>
      <span className={mpp !== null ? "text-good-500" : "text-mist-600"}>
        {mpp !== null ? `1 px = ${mpp.toLocaleString("de-DE", { maximumFractionDigits: 4 })} mm` : "px-Modus"}
        {mpp !== null && displayUnit !== "mm" ? ` · Anzeige ${displayUnit}` : ""}
      </span>
    </div>
  );
}
