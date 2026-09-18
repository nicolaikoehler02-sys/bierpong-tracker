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

/**
 * Ein Fleck, der vom gelernten Hintergrund abweicht und nach Größe und Form
 * als Ball durchgehen könnte.
 *
 * Ein Kandidat ist ausdrücklich noch kein Ball: Ob aus ihm ein Wurf wird,
 * entscheidet erst das Verketten zu Flugbahnen im nächsten Schritt.
 */
export interface BallCandidate {
  /** Schwerpunkt in Bildpunkten des Originalbildes */
  x: number;
  y: number;
  /** Umschließendes Rechteck in Bildpunkten des Originalbildes */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Anzahl der geprüften Pixel im Fleck (siehe `sampleStep`) */
  pixels: number;
  /** Anteil des Flecks an allen geprüften Pixeln (0–1) */
  coverage: number;
  /** Verhältnis von Längs- zu Querseite: 1 = rund, größer = Streifen */
  aspect: number;
  /** Anteil des umschließenden Rechtecks, den der Fleck ausfüllt (0–1) */
  fill: number;
}

/** Ergebnis für ein einzelnes Bild der Aufnahme. */
export interface FrameResult {
  /** Laufende Nummer des Bildes in der Aufnahme, beginnend bei 0 */
  index: number;
  /** Zeitpunkt in der Aufnahme in Sekunden */
  at: number;
  /**
   * Alle Ball-Kandidaten dieses Bildes, größter zuerst. Mehrere sind erlaubt
   * und erwünscht — welcher davon zu einem Wurf gehört, entscheidet erst das
   * Verketten zu Flugbahnen.
   */
  candidates: BallCandidate[];
  /** Anteil aller vom Hintergrund abweichenden Pixel am geprüften Bild (0–1) */
  changedShare: number;
  /**
   * Das ganze Bild weicht ab — Licht umgeschaltet, Kamera bewegt.
   * In diesem Fall wird bewusst kein Kandidat gemeldet.
   */
  sceneChanged: boolean;
  /**
   * Der Hintergrund wird gerade gelernt: am Anfang der Aufnahme und noch einmal,
   * wenn sich die Szene dauerhaft verändert hat. Solange wird nichts gemeldet.
   */
  learning: boolean;
}
