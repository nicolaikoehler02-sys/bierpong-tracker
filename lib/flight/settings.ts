/**
 * Alle Stellschrauben der Seitenkamera-Auswertung an einer Stelle.
 *
 * Skript und spätere Browser-Seite benutzen dasselbe Objekt, damit beide
 * garantiert identisch rechnen (siehe ADR 0002).
 */
export interface FlightSettings {
  /** Bilder pro Sekunde der Aufnahme — daraus entsteht der Zeitpunkt je Bild */
  fps: number;
  /** Mindestunterschied der Helligkeit zum vorherigen Bild (0–255), ab dem ein Pixel als verändert gilt */
  minChange: number;
  /** Nur jedes n-te Pixel wird geprüft — 1 = jedes Pixel, 2 = jedes zweite in beiden Richtungen */
  sampleStep: number;
  /** Mindestgröße eines Flecks in geprüften Pixeln; kleinere gelten als Rauschen */
  minPixels: number;
  /** Ab diesem Anteil veränderter Pixel gilt das ganze Bild als verändert und es wird nichts gemeldet */
  maxChangedShare: number;
}

export const defaultFlightSettings: FlightSettings = {
  fps: 30,
  // Holzwand und Ballfarbe sind noch offen; 30 lässt Bildrauschen der Webcam liegen.
  minChange: 30,
  // Jedes zweite Pixel reicht: Ein fliegender Ball ist auch verkleinert noch ein Fleck.
  sampleStep: 2,
  // Rund ein Ball von etwa 8 Pixeln Durchmesser bei `sampleStep` 2.
  minPixels: 12,
  // Darüber ist es kein Wurf mehr, sondern Licht oder eine bewegte Kamera.
  maxChangedShare: 0.25,
};
