import { type Rgb, fillRect, strokeRect } from "./frame.ts";
import type { BallCandidate, FlightFrame, FrameResult } from "./types.ts";

/** Ball-Kandidat */
const COLOR_CANDIDATE: Rgb = [34, 197, 94];
/** Ganzes Bild verändert — Licht oder Kamera */
const COLOR_SCENE: Rgb = [248, 113, 113];
/** Der Hintergrund wird gerade gelernt */
const COLOR_LEARNING: Rgb = [250, 204, 21];

/**
 * Malt die Markierungen der Auswertung direkt ins Bild — für das Overlay-Video.
 * Das Bild wird dabei verändert; der Kern selbst rührt kein Bild an.
 *
 * Markiert wird jeder Kandidat, nicht nur der größte: Im Overlay soll sichtbar
 * sein, was der Kern alles für einen Ball hält.
 */
export function paintOverlay(frame: FlightFrame, result: FrameResult): void {
  if (result.learning) {
    strokeRect(frame, 0, 0, frame.width, frame.height, COLOR_LEARNING, 4);
    return;
  }
  if (result.sceneChanged) {
    strokeRect(frame, 0, 0, frame.width, frame.height, COLOR_SCENE, 4);
    return;
  }

  for (const candidate of result.candidates) mark(frame, candidate);
}

/** Rahmen um den Kandidaten, dazu ein Fadenkreuz auf dem Schwerpunkt. */
function mark(frame: FlightFrame, candidate: BallCandidate): void {
  const pad = 4;
  strokeRect(
    frame,
    candidate.left - pad,
    candidate.top - pad,
    candidate.width + 2 * pad,
    candidate.height + 2 * pad,
    COLOR_CANDIDATE,
    2,
  );
  fillRect(frame, candidate.x - 9, candidate.y - 1, 18, 2, COLOR_CANDIDATE);
  fillRect(frame, candidate.x - 1, candidate.y - 9, 2, 18, COLOR_CANDIDATE);
}
