import type { FlightAnalysis, FlightSettings, FrameResult, Throw } from "../../lib/flight/index.ts";

/**
 * Die Tabellen für den Menschen: Semikolon als Trennzeichen, damit Excel sie
 * ohne Import-Dialog öffnet; Zahlen mit Punkt, damit Auswertungen sie direkt
 * weiterverarbeiten können.
 */
const SEPARATOR = ";";

/**
 * Die Wurftabelle — eine Zeile je erkanntem Wurf. Das ist die Tabelle, um die
 * es geht: Zeitpunkt, Seite und die Kennzahlen der Flugbahn.
 *
 * Die Spalten in Bildpunkten stehen immer. Die Spalten in Zentimetern und
 * Metern je Sekunde stehen daneben und bleiben leer, wenn ohne Kalibrierung
 * ausgewertet wurde — so hat die Tabelle jedes Mal dieselben Spalten und lässt
 * sich zwischen Aufnahmen vergleichen.
 *
 * `aufsetzer` steht bei jedem Wurf, weil jeder Wurf eingeordnet ist. Die drei
 * Spalten zum Aufsetzpunkt bleiben bei einem direkten Wurf leer — dort gibt es
 * keinen. `aufsetzer_s` ist ein geschätzter Zeitpunkt zwischen zwei Bildern und
 * deshalb keine glatte Vielfache der Bildzeit; das ist Absicht und kein
 * Rundungsfehler.
 */
const THROW_COLUMNS = [
  "nr",
  "abwurf_s",
  "ende_s",
  "dauer_s",
  "seite",
  "aufsetzer",
  "aufsetzer_s",
  "aufsetzer_x",
  "aufsetzer_y",
  "bild_von",
  "bild_bis",
  "punkte",
  "abwurf_x",
  "abwurf_y",
  "ende_x",
  "ende_y",
  "scheitel_s",
  "scheitelhoehe_cm",
  "weite_cm",
  "tempo_m_s",
  "tempo_waagerecht_m_s",
  "strecke_cm",
  "scheitelhoehe_px",
  "strecke_px",
  "weite_px",
  "tempo_px_s",
  "tempo_waagerecht_px_s",
] as const;

export function throwsToCsv(throws: readonly Throw[]): string {
  const lines = [THROW_COLUMNS.join(SEPARATOR)];
  for (const found of throws) {
    const first = found.points[0];
    const last = found.points[found.points.length - 1];
    const { metrics } = found;
    lines.push(
      [
        found.nr,
        found.startedAt.toFixed(3),
        found.endedAt.toFixed(3),
        metrics.duration.toFixed(3),
        found.side,
        found.bounce ? "ja" : "nein",
        optional(found.bouncePoint?.at, 3),
        optional(found.bouncePoint?.x, 1),
        optional(found.bouncePoint?.y, 1),
        found.startFrame,
        found.endFrame,
        found.points.length,
        first.x.toFixed(1),
        first.y.toFixed(1),
        last.x.toFixed(1),
        last.y.toFixed(1),
        metrics.peakAt.toFixed(3),
        optional(metrics.peakHeightCm, 1),
        optional(metrics.spanCm, 1),
        optional(metrics.speedMps, 2),
        optional(metrics.speedXMps, 2),
        optional(metrics.distanceCm, 1),
        metrics.peakHeight.toFixed(1),
        metrics.distance.toFixed(1),
        metrics.span.toFixed(1),
        metrics.speed.toFixed(1),
        metrics.speedX.toFixed(1),
      ].join(SEPARATOR),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Ein Wert, den es nicht bei jedem Wurf gibt — die Zentimeterwerte ohne
 * Kalibrierung, der Aufsetzpunkt bei einem direkten Wurf. Dann bleibt die Zelle
 * leer statt eine 0 zu behaupten.
 */
function optional(value: number | undefined, digits: number): string {
  return value === undefined ? "" : value.toFixed(digits);
}

/**
 * Die Kandidatentabelle zum Nachsehen: je Kandidat eine Zeile. Bilder ohne
 * Kandidaten bekommen trotzdem eine Zeile, damit die Aufnahme in der Tabelle
 * lückenlos ist.
 *
 * Sie beantwortet die Frage, warum ein Wurf fehlt oder einer zu viel dasteht —
 * gezählt wird trotzdem in der Wurftabelle.
 */
const CANDIDATE_COLUMNS = [
  "bild",
  "zeit_s",
  "kandidaten",
  "nr",
  "x",
  "y",
  "links",
  "oben",
  "breite",
  "hoehe",
  "pixel",
  "laenge",
  "fuellung",
  "anteil",
  "szenenwechsel",
  "lernphase",
] as const;

export function candidatesToCsv(results: readonly FrameResult[]): string {
  const lines = [CANDIDATE_COLUMNS.join(SEPARATOR)];
  for (const result of results) {
    const head = [result.index, result.at.toFixed(3), result.candidates.length];
    const tail = [
      result.changedShare.toFixed(4),
      result.sceneChanged ? "ja" : "nein",
      result.learning ? "ja" : "nein",
    ];
    if (result.candidates.length === 0) {
      lines.push([...head, "", "", "", "", "", "", "", "", "", "", ...tail].join(SEPARATOR));
      continue;
    }
    result.candidates.forEach((candidate, nr) => {
      lines.push(
        [
          ...head,
          nr + 1,
          candidate.x.toFixed(1),
          candidate.y.toFixed(1),
          candidate.left,
          candidate.top,
          candidate.width,
          candidate.height,
          candidate.pixels,
          candidate.aspect.toFixed(2),
          candidate.fill.toFixed(2),
          ...tail,
        ].join(SEPARATOR),
      );
    });
  }
  return `${lines.join("\r\n")}\r\n`;
}

export interface ReportMeta {
  /** Pfad der ausgewerteten Aufnahme */
  source: string;
  width: number;
  height: number;
  settings: FlightSettings;
}

/**
 * Die Datei für die Weiterverarbeitung. Die Schlüssel entsprechen bewusst
 * eins zu eins den Typen des Erkennungskerns, damit die Folgeschritte sie
 * ohne Umrechnung einlesen können — einschließlich der vollständigen
 * Punktfolge jeder Flugbahn.
 *
 * Kalibrierung und daraus errechneter Maßstab stehen mit in der Datei: Ohne sie
 * wäre später nicht mehr nachvollziehbar, auf welcher Grundlage die Zentimeter
 * entstanden sind. `calibration` ist das, was angegeben wurde (steht ohnehin
 * schon in `settings`, hier aber an sichtbarer Stelle), `scale` das, womit
 * tatsächlich gerechnet wurde — beides `null`, wenn in Bildpunkten ausgewertet
 * wurde.
 */
export function toJson(analysis: FlightAnalysis, meta: ReportMeta): string {
  return `${JSON.stringify(
    {
      source: meta.source,
      createdAt: new Date().toISOString(),
      frame: { width: meta.width, height: meta.height, count: analysis.frames.length },
      calibration: meta.settings.calibration,
      scale: analysis.scale,
      settings: meta.settings,
      throws: analysis.throws,
      results: analysis.frames,
    },
    null,
    2,
  )}\n`;
}

/**
 * Die Zahlen zur Aufnahme stehen im Kern, nicht hier: Die Browser-Seite zeigt
 * dieselben, und sie sollen an einer Stelle gezählt werden (siehe
 * `lib/flight/summary.ts`).
 */
export { type Summary, summarize } from "../../lib/flight/index.ts";
