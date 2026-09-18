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

/** Ein einzelner gesehener Punkt einer Flugbahn. */
export interface FlightPoint {
  /** Laufende Nummer des Bildes in der Aufnahme */
  index: number;
  /** Zeitpunkt in der Aufnahme in Sekunden */
  at: number;
  /** Stelle im Bild in Bildpunkten */
  x: number;
  y: number;
}

/**
 * Die Seite, von der geworfen wurde — aus der Flugrichtung.
 *
 * Der Kern kennt bewusst keine Namen: Wer links steht, wird außerhalb des Kerns
 * entschieden und ändert sich von Aufnahme zu Aufnahme.
 */
export type ThrowerSide = "links" | "rechts";

/** Ein von Hand markierter Punkt im Bild, in Bildpunkten. */
export interface CalibrationPoint {
  x: number;
  y: number;
}

/**
 * Die Kalibrierung einer Aufstellung: zwei markierte Punkte auf der **vorderen
 * Tischkante** und die tatsächliche Länge dazwischen in Zentimetern.
 *
 * Zwei Punkte plus eine bekannte Länge sind die robusteste Angabe, die ohne
 * Bildverarbeitung auskommt: Die vordere Tischkante ist im Seitenbild die
 * längste Strecke, deren wahres Maß wir kennen, und je länger die Strecke, desto
 * weniger schlägt ein Bildpunkt Ungenauigkeit beim Markieren durch. Gefunden
 * wird die Kante ausdrücklich nicht — sie wird angegeben.
 *
 * Ein Turniertisch ist 2,40 m lang (`TOURNAMENT_TABLE_LENGTH_CM`), unser
 * Trainingstisch weicht ab. Deshalb steht die Länge immer dabei.
 */
export interface TableCalibration {
  /** Erster markierter Punkt auf der vorderen Tischkante */
  edgeStart: CalibrationPoint;
  /** Zweiter markierter Punkt auf der vorderen Tischkante */
  edgeEnd: CalibrationPoint;
  /** Tatsächliche Länge zwischen den beiden Punkten in Zentimetern */
  tableLengthCm: number;
  /**
   * Bildbreite in Bildpunkten, in der die beiden Punkte markiert wurden.
   *
   * Nur nötig, wenn in einer anderen Größe markiert als ausgewertet wird — das
   * Auswertungsskript verkleinert die Aufnahme standardmäßig auf 640 Bildpunkte
   * Breite, markiert wird aber meist in der vollen Auflösung. Fehlt die Angabe,
   * gelten die Punkte als im ausgewerteten Bild markiert.
   */
  referenceWidth?: number;
}

/**
 * Der Maßstab einer Aufstellung: wie viele Zentimeter ein Bildpunkt bedeutet.
 *
 * Er entsteht aus der Kalibrierung (siehe `toScale` in `calibration.ts`) und
 * gilt für die ganze Aufnahme, weil Kamera und Tisch zwischendurch nicht bewegt
 * werden.
 */
export interface FlightScale {
  /** Zentimeter je Bildpunkt des ausgewerteten Bildes */
  cmPerPixel: number;
  /** Abstand der beiden markierten Kantenpunkte im ausgewerteten Bild, in Bildpunkten */
  edgeLength: number;
  /** Die angegebene Tischlänge in Zentimetern — dieselbe Zahl wie in der Kalibrierung */
  tableLengthCm: number;
  /**
   * Faktor, mit dem die markierten Punkte auf die ausgewertete Bildgröße
   * umgerechnet wurden. 1 heißt: markiert wurde in derselben Größe, in der auch
   * ausgewertet wird.
   */
  imageFactor: number;
}

/**
 * Einfache Kennzahlen einer Flugbahn.
 *
 * Die Bildpunkt-Werte gibt es immer; sie sind untereinander vergleichbar,
 * solange dieselbe Aufnahmegröße ausgewertet wird. Die echten Einheiten stehen
 * nur daneben, wenn eine Kalibrierung vorliegt — ohne sie bleibt es bei
 * Bildpunkten, und die Erkennung selbst ändert sich dadurch nicht.
 */
export interface ThrowMetrics {
  /** Dauer vom Abwurf bis zum letzten gesehenen Punkt in Sekunden */
  duration: number;
  /** Höhe des Scheitels über dem Abwurfpunkt in Bildpunkten (nach oben positiv) */
  peakHeight: number;
  /** Zeitpunkt des Scheitels in Sekunden */
  peakAt: number;
  /** Länge der Bahn in Bildpunkten: Summe der Abstände zwischen den Punkten */
  distance: number;
  /** Waagerechte Strecke zwischen Abwurf und letztem Punkt in Bildpunkten */
  span: number;
  /** Geschwindigkeit entlang der Bahn in Bildpunkten je Sekunde */
  speed: number;
  /** Waagerechte Geschwindigkeit in Bildpunkten je Sekunde */
  speedX: number;

  // --- Nur mit Kalibrierung (siehe `calibration.ts`) ---
  /** Höhe des Scheitels über dem Abwurfpunkt in Zentimetern */
  peakHeightCm?: number;
  /** Länge der Bahn in Zentimetern */
  distanceCm?: number;
  /** Waagerechte Weite zwischen Abwurf und letztem Punkt in Zentimetern */
  spanCm?: number;
  /** Geschwindigkeit entlang der Bahn in Metern je Sekunde */
  speedMps?: number;
  /** Waagerechte Geschwindigkeit in Metern je Sekunde */
  speedXMps?: number;
}

/**
 * Ein erkannter Wurf: eine Flugbahn, die alle Prüfungen bestanden hat.
 *
 * Alles, was die Prüfungen nicht besteht — ein zurückrollender Ball, eine Hand,
 * ein Schatten —, ist kein Wurf und taucht hier nicht auf.
 */
export interface Throw {
  /** Laufende Nummer in der Aufnahme, beginnend bei 1 */
  nr: number;
  /** Zeitpunkt des Abwurfs in Sekunden — der erste gesehene Punkt der Bahn */
  startedAt: number;
  /** Zeitpunkt des letzten gesehenen Punktes in Sekunden */
  endedAt: number;
  /** Bildnummer des Abwurfs */
  startFrame: number;
  /** Bildnummer des letzten gesehenen Punktes */
  endFrame: number;
  /** Seite des Werfers, aus der Flugrichtung */
  side: ThrowerSide;
  /** Die vollständige Punktfolge der Flugbahn, nach Bildnummer aufsteigend */
  points: FlightPoint[];
  metrics: ThrowMetrics;
}

/**
 * Das Ergebnis einer ganzen Aufnahme: das Bild-für-Bild-Ergebnis und die daraus
 * erkannten Würfe.
 *
 * Beides kommt aus derselben Naht. Die Würfe sind das Ziel; die Bildergebnisse
 * bleiben daneben stehen, weil sich nur an ihnen nachsehen lässt, warum der
 * Kern eine Bahn übersehen oder erfunden hat.
 */
export interface FlightAnalysis {
  /** Ein Ergebnis je Bild der Aufnahme, in der Reihenfolge der Bilder */
  frames: FrameResult[];
  /** Alle erkannten Würfe der Aufnahme, nach Abwurfzeitpunkt sortiert */
  throws: Throw[];
  /**
   * Der Maßstab, mit dem gerechnet wurde — `null`, wenn ohne Kalibrierung
   * ausgewertet wurde und alle Kennzahlen in Bildpunkten stehen.
   *
   * Er wandert mit den Ergebnissen mit, damit später nachvollziehbar ist, auf
   * welcher Grundlage die Zentimeter entstanden sind.
   */
  scale: FlightScale | null;
}
