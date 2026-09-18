/**
 * Erkennungskern der Seitenkamera.
 *
 * Die einzige Naht des Meilensteins: Bilderfolge plus Einstellungen hinein,
 * die Würfe der Aufnahme und das Ergebnis je Bild heraus. Alles darum herum —
 * Bilder aus der Aufnahme holen, Overlay zeichnen, Tabelle schreiben,
 * Browser-Seite — bleibt dünn.
 */
export { analyzeFlight } from "./detector.ts";
export { type FlightSettings, defaultFlightSettings } from "./settings.ts";
export { type Rgb, createFrame, drawLine, fillDisc, fillRect, strokeRect } from "./frame.ts";
export { paintOverlay } from "./overlay.ts";
export type {
  BallCandidate,
  FlightAnalysis,
  FlightFrame,
  FlightPoint,
  FrameResult,
  Throw,
  ThrowMetrics,
  ThrowerSide,
} from "./types.ts";
