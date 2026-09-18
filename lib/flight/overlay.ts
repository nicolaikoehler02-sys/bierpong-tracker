import { type Rgb, drawLine, fillDisc, fillRect, strokeRect } from "./frame.ts";
import type { BallCandidate, FlightFrame, FrameResult, Throw } from "./types.ts";

/** Ball-Kandidat */
const COLOR_CANDIDATE: Rgb = [34, 197, 94];
/** Ganzes Bild verändert — Licht oder Kamera */
const COLOR_SCENE: Rgb = [248, 113, 113];
/** Der Hintergrund wird gerade gelernt */
const COLOR_LEARNING: Rgb = [250, 204, 21];
/** Flugbahn eines Wurfs von links */
const COLOR_FLIGHT_LEFT: Rgb = [96, 165, 250];
/** Flugbahn eines Wurfs von rechts */
const COLOR_FLIGHT_RIGHT: Rgb = [251, 146, 60];

/** Stärke der Flugbahn in Bildpunkten */
const FLIGHT_THICKNESS = 3;
/** So viele Bilder bleibt die fertige Flugbahn nach dem Wurf noch stehen — eine halbe Sekunde bei 30 Bildern pro Sekunde. */
const FLIGHT_HOLD_FRAMES = 15;

/**
 * Malt die Markierungen der Auswertung direkt ins Bild — für das Overlay-Video.
 * Das Bild wird dabei verändert; der Kern selbst rührt kein Bild an.
 *
 * Markiert wird jeder Kandidat, nicht nur der größte: Im Overlay soll sichtbar
 * sein, was der Kern alles für einen Ball hält. Darüber liegt die erkannte
 * Flugbahn als durchgezogene Linie — daran ist in Sekunden zu sehen, ob der
 * Kern einen Wurf verpasst oder einen Schatten für einen Ball gehalten hat.
 */
export function paintOverlay(
  frame: FlightFrame,
  result: FrameResult,
  throws: readonly Throw[] = [],
): void {
  if (result.learning) {
    strokeRect(frame, 0, 0, frame.width, frame.height, COLOR_LEARNING, 4);
    return;
  }
  if (result.sceneChanged) {
    strokeRect(frame, 0, 0, frame.width, frame.height, COLOR_SCENE, 4);
    return;
  }

  for (const candidate of result.candidates) mark(frame, candidate);
  for (const found of throws) paintFlight(frame, found, result.index);
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

/**
 * Zeichnet die Flugbahn eines Wurfs, solange er läuft — und noch einen Moment
 * danach, damit der fertige Bogen im Video stehen bleibt.
 *
 * Gezeichnet wird nur, was bis zum aktuellen Bild schon gesehen wurde: Die
 * Linie wächst mit dem Ball mit, statt ihm vorauszueilen. Die Farbe sagt, von
 * welcher Seite geworfen wurde.
 */
function paintFlight(frame: FlightFrame, found: Throw, index: number): void {
  if (index < found.startFrame || index > found.endFrame + FLIGHT_HOLD_FRAMES) return;

  const color = found.side === "links" ? COLOR_FLIGHT_LEFT : COLOR_FLIGHT_RIGHT;
  const points = found.points.filter((point) => point.index <= index);
  if (points.length === 0) return;

  for (let i = 1; i < points.length; i++) {
    drawLine(
      frame,
      points[i - 1].x,
      points[i - 1].y,
      points[i].x,
      points[i].y,
      color,
      FLIGHT_THICKNESS,
    );
  }
  // Der Abwurfpunkt bleibt als Scheibe stehen, damit die Richtung auch im
  // Standbild ablesbar ist.
  fillDisc(frame, points[0].x, points[0].y, 4, color);
}
