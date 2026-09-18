import { FlightRun } from "./run.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { FlightAnalysis, FlightFrame } from "./types.ts";

/**
 * Der Erkennungskern der Seitenkamera: Bilderfolge plus Einstellungen hinein,
 * die Würfe der Aufnahme heraus — dazu das Ergebnis je Bild, an dem sich
 * nachsehen lässt, wie sie zustande gekommen sind.
 *
 * Der Ablauf je Bild (siehe `FlightRun`):
 *
 * 1. Das Bild mit dem gelernten Hintergrund vergleichen (siehe `Background`).
 *    Solange der Hintergrund noch gelernt wird, wird nichts gemeldet.
 * 2. Weicht fast das ganze Bild ab, ist es kein Wurf, sondern umgeschaltetes
 *    Licht oder eine bewegte Kamera. Hält das an, wird der Hintergrund neu
 *    gelernt, damit die Aufnahme danach weiter auswertbar ist.
 * 3. Sonst: Hintergrund nachführen und alle Ball-Kandidaten einsammeln
 *    (siehe `findCandidates`).
 *
 * Mehrere Kandidaten je Bild sind ausdrücklich erlaubt. Welcher davon zu
 * welchem Wurf gehört, entscheidet erst der zweite Teil über die ganze
 * Aufnahme: Die Kandidaten werden zu Flugbahnen verkettet (siehe `buildTracks`),
 * und aus den tauglichen Bahnen werden Würfe (siehe `toThrows`).
 *
 * Liegt in den Einstellungen eine Kalibrierung, stehen die Kennzahlen der Würfe
 * zusätzlich in Zentimetern und Metern je Sekunde (siehe `toScale`). Sie greift
 * ausschließlich am Ende, auf die fertigen Kennzahlen: Welche Würfe gefunden
 * werden, ändert sie nicht — ohne Kalibrierung kommen dieselben Würfe heraus,
 * nur in Bildpunkten.
 *
 * Eine Ausnahme gibt es davon: Die Einordnung Aufsetzer/direkt kann mit
 * Kalibrierung anders ausfallen als ohne, weil die Tischebene dann als
 * zusätzliche Prüfung mitspricht (siehe `findBounce` in `bounce.ts`). Die Liste
 * der Würfe selbst bleibt dieselbe.
 *
 * **Alle Bilder auf einmal — wer sie nicht auf einmal hat, nimmt `FlightRun`.**
 * Diese Form passt zum Auswertungsskript, dem ffmpeg die ganze Aufnahme in den
 * Speicher legt. Im Browser kommt ein Bild nach dem anderen aus dem Video;
 * dort wird derselbe Ablauf Bild für Bild gefüttert. Es ist buchstäblich
 * derselbe Code: Diese Funktion ist nichts anderes als ein `FlightRun` in einer
 * Schleife.
 */
export function analyzeFlight(
  frames: readonly FlightFrame[],
  settings: FlightSettings = defaultFlightSettings,
): FlightAnalysis {
  const run = new FlightRun(settings);
  for (const frame of frames) run.push(frame);
  return run.finish();
}
