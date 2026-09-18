import type { FlightFrame } from "./types.ts";

/** Farbe als R, G, B (0–255). */
export type Rgb = readonly [number, number, number];

/** Legt ein leeres Bild an, standardmäßig undurchsichtig schwarz. */
export function createFrame(width: number, height: number, color: Rgb = [0, 0, 0]): FlightFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  const frame: FlightFrame = { width, height, data };
  fillRect(frame, 0, 0, width, height, color);
  return frame;
}

/** Füllt ein Rechteck; Teile außerhalb des Bildes werden abgeschnitten. */
export function fillRect(
  frame: FlightFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgb,
): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(frame.width, Math.round(x + width));
  const y1 = Math.min(frame.height, Math.round(y + height));
  for (let py = y0; py < y1; py++) {
    let p = (py * frame.width + x0) * 4;
    for (let px = x0; px < x1; px++) {
      frame.data[p] = color[0];
      frame.data[p + 1] = color[1];
      frame.data[p + 2] = color[2];
      frame.data[p + 3] = 255;
      p += 4;
    }
  }
}

/** Zeichnet nur die Kanten eines Rechtecks. */
export function strokeRect(
  frame: FlightFrame,
  x: number,
  y: number,
  width: number,
  height: number,
  color: Rgb,
  thickness = 2,
): void {
  fillRect(frame, x, y, width, thickness, color);
  fillRect(frame, x, y + height - thickness, width, thickness, color);
  fillRect(frame, x, y, thickness, height, color);
  fillRect(frame, x + width - thickness, y, thickness, height, color);
}

/**
 * Zeichnet eine durchgezogene Strecke — im Overlay ein Stück der Flugbahn.
 *
 * Gesetzt wird ein kleines Quadrat je Bildpunkt Weglänge; das ergibt eine
 * lückenlose Linie in jeder Schräglage, ohne Kantenglättung.
 */
export function drawLine(
  frame: FlightFrame,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
  thickness = 2,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  const half = thickness / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillRect(frame, x0 + dx * t - half, y0 + dy * t - half, thickness, thickness, color);
  }
}

/** Zeichnet eine gefüllte Scheibe — im Test der helle Punkt, im Overlay die Markierung. */
export function fillDisc(frame: FlightFrame, cx: number, cy: number, radius: number, color: Rgb): void {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(frame.width - 1, Math.ceil(cx + radius));
  const y1 = Math.min(frame.height - 1, Math.ceil(cy + radius));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy > r2) continue;
      const p = (py * frame.width + px) * 4;
      frame.data[p] = color[0];
      frame.data[p + 1] = color[1];
      frame.data[p + 2] = color[2];
      frame.data[p + 3] = 255;
    }
  }
}
