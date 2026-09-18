import type { FlightSettings } from "./settings.ts";
import type { FlightScale, TableCalibration } from "./types.ts";

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
