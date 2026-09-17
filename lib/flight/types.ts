/**
 * Ein einzelnes Bild einer Aufnahme.
 *
 * Gleiche Form wie bei der Deckenkamera (`ImageData`): Breite, Höhe und
 * RGBA-Daten Pixel für Pixel. Dadurch passt derselbe Kern sowohl ins
 * Auswertungsskript als auch später in die Browser-Seite.
 */
export interface FlightFrame {
  width: number;
  height: number;
  /** RGBA, vier Werte je Pixel, zeilenweise von links oben */
  data: Uint8ClampedArray;
}

/** Ein zusammenhängender Fleck, der sich gegenüber dem vorherigen Bild verändert hat. */
export interface ChangeBlob {
  /** Schwerpunkt in Pixeln des Originalbildes */
  x: number;
  y: number;
  /** Umschließendes Rechteck in Pixeln des Originalbildes */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Anzahl der geprüften Pixel im Fleck (siehe `sampleStep`) */
  pixels: number;
  /** Anteil des Flecks an allen geprüften Pixeln (0–1) */
  coverage: number;
}

/** Ergebnis für ein einzelnes Bild der Aufnahme. */
export interface FrameResult {
  /** Laufende Nummer des Bildes in der Aufnahme, beginnend bei 0 */
  index: number;
  /** Zeitpunkt in der Aufnahme in Sekunden */
  at: number;
  /**
   * Die größte Veränderung gegenüber dem vorherigen Bild.
   * `null`, wenn nichts Auffälliges gefunden wurde oder das erste Bild
   * ausgewertet wird — dort gibt es kein Vorbild.
   */
  change: ChangeBlob | null;
  /** Anteil aller veränderten Pixel am geprüften Bild (0–1) */
  changedShare: number;
  /**
   * Das ganze Bild hat sich verändert — Licht umgeschaltet, Kamera bewegt.
   * In diesem Fall wird bewusst keine Veränderung gemeldet.
   */
  sceneChanged: boolean;
}
