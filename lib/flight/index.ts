/**
 * Erkennungskern der Seitenkamera.
 *
 * Die einzige Naht des Meilensteins: Bilderfolge plus Einstellungen hinein,
 * Liste von Ergebnissen heraus. Alles darum herum — Bilder aus der Aufnahme
 * holen, Overlay zeichnen, Tabelle schreiben, Browser-Seite — bleibt dünn.
 */
export { analyzeFlight } from "./detector.ts";
export { type FlightSettings, defaultFlightSettings } from "./settings.ts";
export { type Rgb, createFrame, fillDisc, fillRect, strokeRect } from "./frame.ts";
export { paintOverlay } from "./overlay.ts";
export type { ChangeBlob, FlightFrame, FrameResult } from "./types.ts";
