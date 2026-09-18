/**
 * Erkennungskern der Seitenkamera.
 *
 * Die einzige Naht des Meilensteins: Bilderfolge plus Einstellungen hinein,
 * die Würfe der Aufnahme und das Ergebnis je Bild heraus. Alles darum herum —
 * Bilder aus der Aufnahme holen, Overlay zeichnen, Tabelle schreiben,
 * Browser-Seite — bleibt dünn.
 */
export { analyzeFlight } from "./detector.ts";
export { findBounce } from "./bounce.ts";
export {
  TOURNAMENT_TABLE_LENGTH_CM,
  pixelsPerSecondToMetersPerSecond,
  pixelsToCm,
  tableYAt,
  toScale,
  toTableLine,
} from "./calibration.ts";
export { type FlightSettings, defaultFlightSettings } from "./settings.ts";
export {
  type BenchmarkCheck,
  type DetectedThrow,
  type ThrowComparison,
  type ThrowMark,
  type ThrowMatch,
  type ThrowScore,
  compareThrows,
  defaultMatchWindow,
  flightBenchmark,
  rateThrows,
} from "./evaluation.ts";
export { type Rgb, createFrame, drawLine, fillDisc, fillRect, strokeRect } from "./frame.ts";
export { paintOverlay } from "./overlay.ts";
export type {
  BallCandidate,
  BouncePoint,
  CalibrationPoint,
  FlightAnalysis,
  FlightFrame,
  FlightPoint,
  FlightScale,
  FrameResult,
  TableCalibration,
  TableLine,
  Throw,
  ThrowMetrics,
  ThrowerSide,
} from "./types.ts";
