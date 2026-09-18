/**
 * Die Kalibrierung für das Auswertungsskript: eine kleine JSON-Datei neben der
 * Aufnahme.
 *
 * **Warum eine Datei und keine Befehlszeilenangaben?** Die Kalibrierung gehört
 * zur Aufstellung, nicht zum einzelnen Aufruf: Solange Kamera und Tisch stehen,
 * gilt sie für jede Aufnahme des Abends. Fünf Zahlen bei jedem Aufruf neu zu
 * tippen wäre genau die Gelegenheit, bei der sich ein Zahlendreher einschleicht
 * — und niemand würde ihn bemerken, weil das Ergebnis trotzdem plausibel
 * aussieht. Die Datei lässt sich einmal anlegen, wiederverwenden, neben die
 * Aufnahme legen und später nachlesen. Sie hat außerdem dieselbe Form wie das,
 * was die spätere Browser-Seite aus zwei Klicks erzeugt.
 *
 * Aufbau (alle Stellen in Bildpunkten der Aufnahme):
 *
 * ```json
 * {
 *   "edgeStart": { "x": 40, "y": 306 },
 *   "edgeEnd": { "x": 600, "y": 306 },
 *   "tableLengthCm": 240,
 *   "referenceWidth": 640
 * }
 * ```
 *
 * `edgeStart` und `edgeEnd` sind zwei Punkte auf der **vorderen Tischkante**,
 * `tableLengthCm` die tatsächliche Länge dazwischen. `referenceWidth` ist die
 * Bildbreite, in der markiert wurde — meist die volle Breite der Aufnahme,
 * während ausgewertet wird, was `--breite` vorgibt.
 */
import type { CalibrationPoint, TableCalibration } from "../../lib/flight/index.ts";
import { readJsonFile } from "./json-datei.ts";

/** Liest die Kalibrierung aus einer JSON-Datei und prüft sie. */
export async function readCalibration(file: string): Promise<TableCalibration> {
  let parsed: unknown;
  try {
    parsed = await readJsonFile(file);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Kalibrierung nicht lesbar (${file}): ${reason}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Kalibrierung muss ein JSON-Objekt sein: ${file}`);
  }
  const raw = parsed as Record<string, unknown>;

  const calibration: TableCalibration = {
    edgeStart: point(raw.edgeStart, "edgeStart", file),
    edgeEnd: point(raw.edgeEnd, "edgeEnd", file),
    tableLengthCm: positive(raw.tableLengthCm, "tableLengthCm", file),
  };
  if (raw.referenceWidth !== undefined) {
    calibration.referenceWidth = positive(raw.referenceWidth, "referenceWidth", file);
  }
  return calibration;
}

function point(value: unknown, name: string, file: string): CalibrationPoint {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Kalibrierung: "${name}" fehlt oder ist kein Punkt (${file}).`);
  }
  const raw = value as Record<string, unknown>;
  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
    throw new Error(`Kalibrierung: "${name}" braucht die Zahlen "x" und "y" (${file}).`);
  }
  return { x: raw.x as number, y: raw.y as number };
}

function positive(value: unknown, name: string, file: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new Error(`Kalibrierung: "${name}" muss eine Zahl größer als 0 sein (${file}).`);
  }
  return value as number;
}
