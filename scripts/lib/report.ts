import type { FlightSettings, FrameResult } from "../../lib/flight/index.ts";

/**
 * Die Tabelle für den Menschen: Semikolon als Trennzeichen, damit Excel sie
 * ohne Import-Dialog öffnet; Zahlen mit Punkt, damit Auswertungen sie direkt
 * weiterverarbeiten können.
 */
const SEPARATOR = ";";
const COLUMNS = [
  "bild",
  "zeit_s",
  "erkannt",
  "x",
  "y",
  "links",
  "oben",
  "breite",
  "hoehe",
  "pixel",
  "anteil",
  "szenenwechsel",
] as const;

export function toCsv(results: readonly FrameResult[]): string {
  const lines = [COLUMNS.join(SEPARATOR)];
  for (const result of results) {
    const change = result.change;
    lines.push(
      [
        result.index,
        result.at.toFixed(3),
        change ? "ja" : "nein",
        change ? change.x.toFixed(1) : "",
        change ? change.y.toFixed(1) : "",
        change ? change.left : "",
        change ? change.top : "",
        change ? change.width : "",
        change ? change.height : "",
        change ? change.pixels : "",
        result.changedShare.toFixed(4),
        result.sceneChanged ? "ja" : "nein",
      ].join(SEPARATOR),
    );
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
 * ohne Umrechnung einlesen können.
 */
export function toJson(results: readonly FrameResult[], meta: ReportMeta): string {
  return `${JSON.stringify(
    {
      source: meta.source,
      createdAt: new Date().toISOString(),
      frame: { width: meta.width, height: meta.height, count: results.length },
      settings: meta.settings,
      results,
    },
    null,
    2,
  )}\n`;
}

export interface Summary {
  frames: number;
  detected: number;
  sceneChanges: number;
}

export function summarize(results: readonly FrameResult[]): Summary {
  return {
    frames: results.length,
    detected: results.filter((result) => result.change !== null).length,
    sceneChanges: results.filter((result) => result.sceneChanged).length,
  };
}
