import { type Rgb, fillRect, strokeRect } from "./frame.ts";
import type { FlightFrame, FrameResult } from "./types.ts";

/** Erkannte Veränderung */
const COLOR_CHANGE: Rgb = [34, 197, 94];
/** Ganzes Bild verändert — Licht oder Kamera */
const COLOR_SCENE: Rgb = [248, 113, 113];

/**
 * Malt die Markierungen der Auswertung direkt ins Bild — für das Overlay-Video.
 * Das Bild wird dabei verändert; der Kern selbst rührt kein Bild an.
 */
export function paintOverlay(frame: FlightFrame, result: FrameResult): void {
  if (result.sceneChanged) {
    strokeRect(frame, 0, 0, frame.width, frame.height, COLOR_SCENE, 4);
    return;
  }

  const change = result.change;
  if (!change) return;

  // Rahmen um die Veränderung, dazu ein Fadenkreuz auf dem Schwerpunkt.
  const pad = 4;
  strokeRect(
    frame,
    change.left - pad,
    change.top - pad,
    change.width + 2 * pad,
    change.height + 2 * pad,
    COLOR_CHANGE,
    2,
  );
  fillRect(frame, change.x - 9, change.y - 1, 18, 2, COLOR_CHANGE);
  fillRect(frame, change.x - 1, change.y - 9, 2, 18, COLOR_CHANGE);
}
