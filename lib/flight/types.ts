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
 * Die vordere Tischkante als Strecke im **ausgewerteten** Bild.
 *
 * Sie entsteht aus derselben Kalibrierung wie der Maßstab (siehe `toTableLine`
 * in `calibration.ts`), beantwortet aber eine andere Frage: nicht „wie viele
 * Zentimeter ist ein Bildpunkt", sondern „auf welcher Höhe im Bild liegt der
 * Tisch". Genau das braucht die Aufsetzer-Erkennung, um eine Umkehr nahe der
 * Tischebene von einer Umkehr mitten in der Luft zu unterscheiden.
 *
 * **Achtung, das ist die vordere Kante, nicht die Flugebene.** Der Ball fliegt
 * ungefähr über der Mittellinie des Tisches und kommt dort auf; im Seitenbild
 * liegt diese Stelle über der vorderen Kante, weil sie weiter von der Kamera
 * entfernt ist. Wie weit darüber, hängt von Kamerahöhe und Tischbreite ab und
 * ist hier bewusst nicht ausgerechnet — stattdessen gilt ein großzügiger
 * Spielraum (`maxBounceAboveTable`).
 */
export interface TableLine {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
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
 * Die Stelle, an der ein Aufsetzer auf der Tischplatte aufgekommen ist.
 *
 * **Der Zeitpunkt ist geschätzt und liegt in aller Regel zwischen zwei
 * Bildern.** Bei 30 Bildern pro Sekunde dauert ein Bild 33 Millisekunden; der
 * Ball ist in dieser Zeit rund einen halben Meter weit unterwegs. Dass der
 * Aufprall ausgerechnet in dem Moment stattfindet, in dem die Kamera ein Bild
 * macht, ist der Ausnahmefall. `at` ist deshalb kein Bildzeitpunkt, sondern der
 * Schnittpunkt der Abwärts- mit der Aufwärtsbewegung (siehe `findBounce` in
 * `bounce.ts`), und `x`/`y` sind die dazu gehörende Stelle im Bild — ein Punkt,
 * der so in keinem einzigen Bild zu sehen ist.
 */
export interface BouncePoint {
  /** Geschätzter Zeitpunkt des Aufpralls in Sekunden — zwischen zwei Bildern */
  at: number;
  /** Geschätzte Stelle des Aufpralls in Bildpunkten */
  x: number;
  y: number;
  /** Bildnummer des letzten gesehenen Punktes vor dem Aufprall */
  frameBefore: number;
  /** Bildnummer des ersten gesehenen Punktes nach dem Aufprall */
  frameAfter: number;
  /** Abstieg vor dem Aufprall in Bildpunkten — vom Scheitel bis zum tiefsten gesehenen Punkt */
  drop: number;
  /** Anstieg nach dem Aufprall in Bildpunkten — der zweite Bogen */
  rise: number;
  /** Waagerechte Strecke nach dem Aufprall in Bildpunkten */
  reboundSpan: number;
  /**
   * Abstand des Aufsetzpunktes zur vorderen Tischkante in Bildpunkten, positiv
   * nach oben — `null`, wenn ohne Kalibrierung ausgewertet wurde.
   *
   * Ein positiver Wert ist der Normalfall: Der Ball kommt über der Mitte des
   * Tisches auf, und die liegt im Seitenbild über der vorderen Kante.
   */
  tableGap: number | null;
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
  /**
   * Aufsetzer (`true`) oder direkter Wurf (`false`).
   *
   * Jeder erkannte Wurf ist eingeordnet — es gibt kein „weiß nicht". Wo die
   * Bahn keinen Knick nahe der Tischebene zeigt, gilt sie als direkt; das ist
   * die häufigere und damit die sicherere Annahme.
   */
  bounce: boolean;
  /** Der geschätzte Aufsetzpunkt — `null` bei einem direkten Wurf */
  bouncePoint: BouncePoint | null;
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
