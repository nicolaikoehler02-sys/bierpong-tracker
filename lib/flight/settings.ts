import type { TableCalibration } from "./types.ts";

/**
 * Alle Stellschrauben der Seitenkamera-Auswertung an einer Stelle.
 *
 * Skript und spätere Browser-Seite benutzen dasselbe Objekt, damit beide
 * garantiert identisch rechnen (siehe ADR 0002).
 *
 * Die Größenangaben in Bildpunkten beziehen sich auf das Bild, das der Kern
 * tatsächlich sieht — beim Auswertungsskript sind das standardmäßig 640 Punkte
 * Breite, nicht die volle Auflösung der Aufnahme.
 */
export interface FlightSettings {
  /** Bilder pro Sekunde der Aufnahme — daraus entsteht der Zeitpunkt je Bild */
  fps: number;

  // --- Hintergrund ---
  /** Sekunden am Anfang der Aufnahme, aus denen der Hintergrund gelernt wird (leerer Tisch, keine Personen) */
  backgroundSeconds: number;
  /** Anteil, mit dem ein Bild danach in den Hintergrund nachgeführt wird (0–1); nur für Zellen ohne Veränderung */
  backgroundAdapt: number;
  /** Kleinster Faktor des Helligkeitsausgleichs — darunter ist es kein Belichtungssprung mehr, sondern eine neue Szene */
  minGain: number;
  /** Größter Faktor des Helligkeitsausgleichs */
  maxGain: number;
  /** So viele Bilder am Stück mit verändertem Gesamtbild, bis der Hintergrund neu gelernt wird */
  relearnFrames: number;

  // --- Abweichung vom Hintergrund ---
  /** Mindestunterschied der Helligkeit zum Hintergrund (0–255), ab dem ein Bildpunkt als verändert gilt */
  minChange: number;
  /** Nur jedes n-te Pixel wird geprüft — 1 = jedes Pixel, 2 = jedes zweite in beiden Richtungen */
  sampleStep: number;
  /** Ab diesem Anteil veränderter Pixel gilt das ganze Bild als verändert und es wird nichts gemeldet */
  maxChangedShare: number;

  // --- Form und Größe eines Ball-Kandidaten ---
  /** Mindestgröße eines Flecks in geprüften Pixeln; kleinere gelten als Rauschen */
  minPixels: number;
  /** Höchstgröße eines Flecks in geprüften Pixeln; größere sind Arm, Person oder Schatten */
  maxPixels: number;
  /** Längste Kante des umschließenden Rechtecks in Bildpunkten; darüber ist es kein Ball mehr */
  maxSide: number;
  /** Höchstes Verhältnis von Längs- zu Querseite — lässt Streifen zu, schließt langgestreckte Gebilde aus */
  maxAspect: number;
  /** Mindestanteil des umschließenden Rechtecks, den der Fleck ausfüllt (0–1) — nur kompakte Flecken zählen */
  minFill: number;
  /** Höchstzahl gemeldeter Kandidaten je Bild; gibt es mehr, zählen die größten */
  maxCandidates: number;

  // --- Kandidaten zu Flugbahnen verketten ---
  /**
   * Größter erlaubter Abstand zur Bewegungsvorhersage in Bildpunkten, je
   * überbrücktem Bild. Passt kein Kandidat in diesen Umkreis, wird er nicht an
   * die Bahn gehängt.
   */
  maxPredictionDistance: number;
  /**
   * Größter erlaubter Sprung in Bildpunkten für den zweiten Punkt einer Bahn.
   * Beim ersten Punkt gibt es noch keine Geschwindigkeit und damit keine
   * Vorhersage — nur hier ist der Umkreis so groß wie ein ganzer Flugschritt.
   */
  maxStartJump: number;
  /**
   * So viele Bilder ohne passenden Kandidaten darf eine Bahn überbrücken,
   * bevor sie endet.
   */
  maxMissingFrames: number;

  // --- Aus einer Flugbahn wird ein Wurf ---
  /** Mindestzahl gesehener Punkte einer Bahn */
  minThrowPoints: number;
  /** Waagerechte Mindeststrecke zwischen Abwurf und letztem Punkt in Bildpunkten */
  minThrowSpan: number;
  /**
   * So weit darf ein einzelner Schritt der Gesamtrichtung entgegenlaufen, in
   * Bildpunkten. Darüber gilt die Bahn als umgekehrt und ist kein Wurf.
   */
  maxReverseStep: number;
  /** Kleinste waagerechte Geschwindigkeit eines Wurfs in Bildpunkten je Sekunde */
  minThrowSpeed: number;
  /** Größte waagerechte Geschwindigkeit eines Wurfs in Bildpunkten je Sekunde */
  maxThrowSpeed: number;

  // --- Kalibrierung: aus Bildpunkten werden Zentimeter ---
  /**
   * Die Kalibrierung der Aufstellung: zwei markierte Punkte auf der vorderen
   * Tischkante plus die Tischlänge in Zentimetern (siehe `TableCalibration`).
   *
   * `null` ist der Normalfall und ausdrücklich erlaubt: Ohne Kalibrierung läuft
   * die Auswertung unverändert weiter, nur stehen alle Kennzahlen in
   * Bildpunkten statt in Zentimetern. Die Erkennung selbst hängt nicht davon ab
   * — die Kalibrierung wird erst ganz am Ende auf die fertigen Kennzahlen
   * angewendet.
   *
   * Sie steht hier in den Einstellungen und nicht als zusätzlicher Parameter,
   * damit die Naht des Erkennungskerns eine bleibt: Bilderfolge plus
   * Einstellungen hinein, Ergebnis heraus.
   */
  calibration: TableCalibration | null;
  /**
   * Mindestabstand der beiden markierten Kantenpunkte in Bildpunkten, damit die
   * Kalibrierung überhaupt gilt.
   *
   * Zwei dicht beieinander gesetzte Punkte ergeben einen wilden Maßstab: Ein
   * Bildpunkt Ungenauigkeit beim Markieren schlägt dann voll auf jeden
   * Zentimeterwert durch. Darunter wird die Kalibrierung verworfen und es
   * bleibt bei Bildpunkten.
   */
  minCalibrationSpan: number;
}

export const defaultFlightSettings: FlightSettings = {
  fps: 30,

  // Die echten Aufnahmen beginnen mit rund 10 Sekunden leerem Tisch. Zwei
  // Sekunden davon reichen: Über 60 gemittelte Bilder ist das Bildrauschen der
  // Webcam praktisch verschwunden.
  backgroundSeconds: 2,
  // Rund 1,7 Sekunden, bis eine dauerhafte Änderung übernommen ist — langsam
  // genug, dass ein fliegender Ball nichts verschiebt, schnell genug für
  // wanderndes Tageslicht.
  backgroundAdapt: 0.02,
  // Die Belichtungsautomatik der Webcam regelt um ein paar Zehntel nach; alles
  // darüber hinaus ist umgeschaltetes Licht und kein Regelvorgang.
  minGain: 0.7,
  maxGain: 1.5,
  // Knapp eine Drittelsekunde: Ein Wurf ist so lange nie „das ganze Bild“.
  relearnFrames: 8,

  // Holzwand und Ballfarbe sind noch offen; 30 lässt Bildrauschen der Webcam liegen.
  minChange: 30,
  // Jedes zweite Pixel reicht: Ein fliegender Ball ist auch verkleinert noch ein Fleck.
  sampleStep: 2,
  // Darüber ist es kein Wurf mehr, sondern Licht oder eine bewegte Kamera.
  maxChangedShare: 0.25,

  // Rund ein Ball von etwa 8 Bildpunkten Durchmesser bei `sampleStep` 2.
  minPixels: 12,
  // Ein bewegungsunscharfer Ball deckt rund 100 geprüfte Pixel ab; eine Person
  // liegt um ein Vielfaches darüber.
  maxPixels: 400,
  // Ein Ball ist bei 640 Punkten Bildbreite etwa 10 Punkte groß und wird durch
  // die Bewegungsunschärfe eines Bildes höchstens rund fünfmal so lang.
  maxSide: 80,
  // Ein fliegender Ball ist ein Streifen, kein Kreis — bis zum Fünffachen der
  // eigenen Breite zählt er noch. Ein Arm ist deutlich langgestreckter.
  maxAspect: 5,
  // Ein schräger Streifen füllt sein umschließendes Rechteck knapp zur Hälfte;
  // zerfranste Schatten und Rauschnester bleiben darunter.
  minFill: 0.3,
  // Mehr als eine Handvoll Bälle gleichzeitig gibt es nicht.
  maxCandidates: 6,

  // Gegenüber der geraden Vorhersage verschiebt die Schwerkraft den Ball je
  // Bild nur um wenige Bildpunkte. Der Rest ist Spielraum für den wandernden
  // Schwerpunkt eines bewegungsunscharfen Streifens.
  maxPredictionDistance: 28,
  // Ein Wurf überquert den Tisch — rund 500 Bildpunkte — in gut einer halben
  // Sekunde. Das sind etwa 35 Bildpunkte je Bild; 70 lässt auch den schnellsten
  // Wurf noch anknüpfen, ohne zwei Bälle auf dem Tisch zu verwechseln.
  maxStartJump: 70,
  // Ein Ball verschwindet kurz vor dunklem Hintergrund oder hinter einem
  // Becher. Zwei Bilder sind knapp eine Fünfzehntelsekunde — lang genug dafür,
  // kurz genug, dass keine zwei Würfe zusammenwachsen.
  maxMissingFrames: 2,

  // Ein Wurf ist bei 30 Bildern pro Sekunde rund 20 Bilder lang. Fünf Punkte
  // sind das Wenigste, woran sich eine Richtung überhaupt ablesen lässt.
  minThrowPoints: 5,
  // Rund ein Viertel der Tischlänge. Kürzeres ist eine zuckende Hand am Rand,
  // kein Flug über den Tisch.
  minThrowSpan: 120,
  // Der Schwerpunkt eines Streifens wandert um ein paar Bildpunkte; ein echter
  // Richtungswechsel sieht anders aus.
  maxReverseStep: 4,
  // Ein Wurf überquert den Tisch mit gut 2 Metern je Sekunde, ein
  // zurückrollender Ball mit unter einem. Bei rund 200 Bildpunkten je Meter
  // liegt die Grenze dazwischen.
  minThrowSpeed: 300,
  // Schneller als 10 Meter je Sekunde wirft niemand einen Tischtennisball über
  // einen Biertisch; darüber sind zwei fremde Flecken zu einer Bahn verknüpft.
  maxThrowSpeed: 2200,

  // Ohne Angabe wird in Bildpunkten gerechnet. Das ist der Standard und kein
  // Mangel: Die Kalibrierung gehört zur Aufstellung, nicht zur Erkennung.
  calibration: null,
  // Die Tischkante füllt im Seitenbild fast die ganze Breite — bei 640
  // Bildpunkten also gut 500. Ein Achtel davon ist die Grenze, unterhalb derer
  // offensichtlich nicht die Kante markiert wurde, sondern etwas anderes.
  minCalibrationSpan: 60,
};
