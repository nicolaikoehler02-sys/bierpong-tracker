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
};
