import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { ChangeBlob, FlightFrame, FrameResult } from "./types.ts";

/**
 * Der Erkennungskern der Seitenkamera: Bilderfolge plus Einstellungen hinein,
 * ein Ergebnis je Bild heraus.
 *
 * In dieser Ausbaustufe ist die „Erkennung" bewusst dumm: Gemeldet wird die
 * größte zusammenhängende Veränderung gegenüber dem vorherigen Bild. Flugbahnen
 * und Würfe entstehen erst in den Folgeschritten — hier geht es allein um den
 * durchgehenden Weg von der Aufnahme bis zum sichtbaren Ergebnis.
 */
export function analyzeFlight(
  frames: readonly FlightFrame[],
  settings: FlightSettings = defaultFlightSettings,
): FrameResult[] {
  if (frames.length === 0) return [];

  const { width, height } = frames[0];
  const step = Math.max(1, Math.floor(settings.sampleStep));
  // Es wird auf einem groben Raster gearbeitet: je Rasterzelle ein geprüftes Pixel.
  const gridWidth = Math.ceil(width / step);
  const gridHeight = Math.ceil(height / step);
  const cells = gridWidth * gridHeight;
  const mask = new Uint8Array(cells);
  const stack = new Int32Array(cells);

  const results: FrameResult[] = [];
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    if (frame.width !== width || frame.height !== height) {
      throw new Error("Alle Bilder einer Aufnahme müssen dieselbe Größe haben.");
    }
    const at = settings.fps > 0 ? index / settings.fps : index;

    // Das erste Bild hat kein Vorbild, gegen das es sich vergleichen ließe.
    if (index === 0) {
      results.push({ index, at, change: null, changedShare: 0, sceneChanged: false });
      continue;
    }

    const previous = frames[index - 1];
    mask.fill(CELL_UNCHANGED);
    let changed = 0;
    for (let gy = 0; gy < gridHeight; gy++) {
      const row = gy * step * width;
      for (let gx = 0; gx < gridWidth; gx++) {
        const p = (row + gx * step) * 4;
        const diff = Math.abs(luma(frame.data, p) - luma(previous.data, p));
        if (diff >= settings.minChange) {
          mask[gy * gridWidth + gx] = CELL_CHANGED;
          changed++;
        }
      }
    }

    const changedShare = cells > 0 ? changed / cells : 0;
    // Licht umgeschaltet oder Kamera bewegt: Dann ist jede Meldung wertlos.
    const sceneChanged = changedShare > settings.maxChangedShare;
    const change = sceneChanged
      ? null
      : largestChange(mask, stack, gridWidth, gridHeight, step, width, height, settings.minPixels);

    results.push({ index, at, change, changedShare, sceneChanged });
  }

  return results;
}

const CELL_UNCHANGED = 0;
const CELL_CHANGED = 1;
const CELL_VISITED = 2;

/**
 * Größter zusammenhängender Fleck veränderter Zellen (8er-Nachbarschaft).
 * Ein fliegender Ball ist ein Fleck; Rauschen sind verstreute Einzelzellen.
 *
 * Springt ein Ball zwischen zwei Bildern weiter als seine eigene Breite,
 * verändern sich zwei Stellen gleich stark: die alte und die neue Position.
 * Hier gewinnt dann die zuerst gefundene — welche der beiden gemeint ist,
 * entscheidet erst das Verketten zu Flugbahnen im nächsten Schritt.
 */
function largestChange(
  mask: Uint8Array,
  stack: Int32Array,
  gridWidth: number,
  gridHeight: number,
  step: number,
  width: number,
  height: number,
  minPixels: number,
): ChangeBlob | null {
  const cells = gridWidth * gridHeight;
  let best: { pixels: number; sumX: number; sumY: number; minX: number; minY: number; maxX: number; maxY: number } | null =
    null;

  for (let start = 0; start < cells; start++) {
    if (mask[start] !== CELL_CHANGED) continue;
    let pixels = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = gridWidth;
    let minY = gridHeight;
    let maxX = -1;
    let maxY = -1;
    let top = 0;
    stack[top++] = start;
    mask[start] = CELL_VISITED;

    while (top > 0) {
      const current = stack[--top];
      const x = current % gridWidth;
      const y = (current - x) / gridWidth;
      pixels++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= gridHeight) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= gridWidth) continue;
          const neighbor = ny * gridWidth + nx;
          if (mask[neighbor] === CELL_CHANGED) {
            mask[neighbor] = CELL_VISITED;
            stack[top++] = neighbor;
          }
        }
      }
    }

    if (!best || pixels > best.pixels) best = { pixels, sumX, sumY, minX, minY, maxX, maxY };
  }

  if (!best || best.pixels < minPixels) return null;

  // Zurück vom Raster in Pixel des Originalbildes.
  const left = best.minX * step;
  const top = best.minY * step;
  const right = Math.min(width, (best.maxX + 1) * step);
  const bottom = Math.min(height, (best.maxY + 1) * step);
  return {
    x: (best.sumX / best.pixels) * step + step / 2,
    y: (best.sumY / best.pixels) * step + step / 2,
    left,
    top,
    width: right - left,
    height: bottom - top,
    pixels: best.pixels,
    coverage: cells > 0 ? best.pixels / cells : 0,
  };
}

/** Helligkeit eines Pixels (0–255) an Position `p` im RGBA-Puffer. */
function luma(data: Uint8ClampedArray, p: number): number {
  return 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
}
