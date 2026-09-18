import type { FlightSettings, FrameResult } from "../../lib/flight/index.ts";

/**
 * Die Tabelle für den Menschen: Semikolon als Trennzeichen, damit Excel sie
 * ohne Import-Dialog öffnet; Zahlen mit Punkt, damit Auswertungen sie direkt
 * weiterverarbeiten können.
 *
 * Je Kandidat eine Zeile. Bilder ohne Kandidaten bekommen trotzdem eine Zeile,
 * damit die Aufnahme in der Tabelle lückenlos ist.
 */
const SEPARATOR = ";";
const COLUMNS = [
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

export function toCsv(results: readonly FrameResult[]): string {
  const lines = [COLUMNS.join(SEPARATOR)];
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
  /** Bilder mit mindestens einem Ball-Kandidaten */
  framesWithCandidates: number;
  /** Ball-Kandidaten über die ganze Aufnahme */
  candidates: number;
  sceneChanges: number;
  /** Bilder, in denen der Hintergrund gelernt wurde */
  learningFrames: number;
}

export function summarize(results: readonly FrameResult[]): Summary {
  return {
    frames: results.length,
    framesWithCandidates: results.filter((result) => result.candidates.length > 0).length,
    candidates: results.reduce((sum, result) => sum + result.candidates.length, 0),
    sceneChanges: results.filter((result) => result.sceneChanged).length,
    learningFrames: results.filter((result) => result.learning).length,
  };
}
