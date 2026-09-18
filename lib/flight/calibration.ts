import type { FlightSettings } from "./settings.ts";
import type { FlightScale, TableCalibration, TableLine } from "./types.ts";

/**
 * Länge eines Turniertisches in Zentimetern.
 *
 * Nur ein Vorschlag, kein fester Wert: Unser Trainingstisch weicht ab, deshalb
 * wird die Länge immer angegeben und nie angenommen.
 */
export const TOURNAMENT_TABLE_LENGTH_CM = 240;

/**
 * Rechnet die Kalibrierung in einen Maßstab um — oder meldet, dass es keinen
 * gibt.
 *
 * `null` ist ausdrücklich ein gültiges Ergebnis: ohne Kalibrierung, bei einer
 * unsinnigen Tischlänge oder bei zwei zu dicht beieinander markierten Punkten
 * läuft die Auswertung weiter, nur eben in Bildpunkten. Lieber keine
 * Zentimeter als falsche.
 *
 * Markiert wird in der Größe, in der die Aufnahme vorliegt; ausgewertet wird
 * oft in einer kleineren (das Skript verkleinert standardmäßig auf 640
 * Bildpunkte Breite). `referenceWidth` schließt diese Lücke: Die markierten
 * Punkte werden auf die tatsächlich ausgewertete Bildbreite umgerechnet, bevor
 * der Maßstab entsteht.
 *
 * ## Grenze der Genauigkeit
 *
 * Der Maßstab gilt genau genommen nur in der Ebene der vorderen Tischkante. Der
 * Ball fliegt aber nicht in dieser Ebene, sondern ungefähr über der Mittellinie
 * des Tisches — bei rund 60 Zentimetern Tischbreite also etwa 30 Zentimeter
 * weiter von der Seitenkamera entfernt.
 *
 * In der Perspektive wächst der Maßstab linear mit dem Abstand zur Kamera:
 * Steht die Kamera `a` Zentimeter vor der Tischkante und fliegt der Ball `b`
 * Zentimeter dahinter, sind die echten Zentimeter je Bildpunkt um den Faktor
 * `(a + b) / a` größer als der kalibrierte Maßstab. Alle Zentimeter- und
 * Meter-Werte fallen damit **zu klein** aus:
 *
 * - Kamera 2,5 m vor der Kante, Ball 30 cm dahinter: rund 11 % zu klein
 *   (gemessene 100 cm Scheitelhöhe sind in Wahrheit rund 111 cm).
 * - Kamera 4 m vor der Kante: rund 7 % zu klein.
 * - Kamera 1,5 m vor der Kante: rund 17 % zu klein.
 * - Fliegt der Ball statt über der Mitte über die hintere Tischkante (60 cm),
 *   verdoppelt sich der Fehler jeweils.
 *
 * Dazu kommen die Verzeichnung des Objektivs am Bildrand und eine Kamera, die
 * nicht genau senkrecht auf die Tischkante schaut. Beides wird hier **nicht**
 * herausgerechnet: Dafür bräuchte es den Kameraabstand und die Tischbreite als
 * weitere Angaben, und die Zahlen wären trotzdem geschätzt. Für die Frage
 * „werfe ich flacher als letzte Woche?" reicht ein Maßstab, der immer gleich
 * daneben liegt. Für „mein Bogen ist genau 95 cm hoch" reicht er nicht.
 */
export function toScale(
  calibration: TableCalibration | null | undefined,
  imageWidth: number,
  settings: FlightSettings,
): FlightScale | null {
  if (!calibration) return null;

  const tableLengthCm = calibration.tableLengthCm;
  if (!Number.isFinite(tableLengthCm) || tableLengthCm <= 0) return null;

  // Markiert wurde vielleicht in der vollen Auflösung, ausgewertet wird in der
  // verkleinerten. Der Maßstab ist ein Verhältnis — es reicht, die gemessene
  // Kantenlänge mit demselben Faktor zu verkleinern.
  const reference = calibration.referenceWidth;
  const imageFactor =
    Number.isFinite(reference) && (reference as number) > 0 && imageWidth > 0
      ? imageWidth / (reference as number)
      : 1;

  const dx = (calibration.edgeEnd.x - calibration.edgeStart.x) * imageFactor;
  const dy = (calibration.edgeEnd.y - calibration.edgeStart.y) * imageFactor;
  const edgeLength = Math.sqrt(dx * dx + dy * dy);
  // Zwei fast gleiche Punkte ergeben einen wilden Maßstab: Ein Bildpunkt
  // Ungenauigkeit beim Markieren würde die Zentimeter vervielfachen.
  if (!Number.isFinite(edgeLength) || edgeLength < settings.minCalibrationSpan) return null;

  return {
    cmPerPixel: tableLengthCm / edgeLength,
    edgeLength,
    tableLengthCm,
    imageFactor,
  };
}

/**
 * Dieselbe Kalibrierung, aber als Strecke im ausgewerteten Bild: die vordere
 * Tischkante von links nach rechts.
 *
 * `toScale` macht aus den beiden markierten Punkten eine einzige Zahl — wie
 * viele Zentimeter ein Bildpunkt bedeutet. Für die Aufsetzer-Erkennung reicht
 * das nicht: Sie muss wissen, **wo im Bild** der Tisch liegt, und dafür bleibt
 * die Strecke als Strecke stehen.
 *
 * Geprüft wird wie beim Maßstab: keine Kalibrierung, zu dicht beieinander
 * markierte Punkte — dann gibt es keine Tischebene, und die Aufsetzer-Erkennung
 * arbeitet allein über die Form der Bahn weiter.
 */
export function toTableLine(
  calibration: TableCalibration | null | undefined,
  imageWidth: number,
  settings: FlightSettings,
): TableLine | null {
  if (!calibration) return null;

  const reference = calibration.referenceWidth;
  const imageFactor =
    Number.isFinite(reference) && (reference as number) > 0 && imageWidth > 0
      ? imageWidth / (reference as number)
      : 1;

  const line: TableLine = {
    startX: calibration.edgeStart.x * imageFactor,
    startY: calibration.edgeStart.y * imageFactor,
    endX: calibration.edgeEnd.x * imageFactor,
    endY: calibration.edgeEnd.y * imageFactor,
  };

  const dx = line.endX - line.startX;
  const dy = line.endY - line.startY;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(length) || length < settings.minCalibrationSpan) return null;
  return line;
}

/**
 * Die Höhe der vorderen Tischkante an einer Stelle x, in Bildpunkten.
 *
 * Die Kante darf im Bild schräg liegen — die Kamera steht selten genau
 * senkrecht davor. Außerhalb der beiden markierten Punkte wird die Gerade
 * verlängert; das ist genauer als sie dort abzuschneiden, denn markiert wird
 * oft ein Stück innerhalb der sichtbaren Kante.
 */
export function tableYAt(line: TableLine, x: number): number {
  const dx = line.endX - line.startX;
  // Eine senkrecht stehende „Kante" ist keine: Dann gibt es keine Höhe je x,
  // und die Mitte der Strecke ist die einzige sinnvolle Antwort.
  if (Math.abs(dx) < 1e-6) return (line.startY + line.endY) / 2;
  return line.startY + ((x - line.startX) / dx) * (line.endY - line.startY);
}

/** Bildpunkte in Zentimeter — der ganze Kern der Umrechnung. */
export function pixelsToCm(pixels: number, scale: FlightScale): number {
  return pixels * scale.cmPerPixel;
}

/**
 * Bildpunkte je Sekunde in Meter je Sekunde.
 *
 * Die Zeit kommt aus den Bildern pro Sekunde und ist damit schon echt; nur die
 * Strecke muss umgerechnet werden — und von Zentimetern in Meter.
 */
export function pixelsPerSecondToMetersPerSecond(
  pixelsPerSecond: number,
  scale: FlightScale,
): number {
  return (pixelsPerSecond * scale.cmPerPixel) / 100;
}
