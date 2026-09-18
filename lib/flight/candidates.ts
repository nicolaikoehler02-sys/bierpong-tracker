import { CELL_FOREGROUND } from "./background.ts";
import type { FlightSettings } from "./settings.ts";
import type { BallCandidate } from "./types.ts";

/** Zelle gehört zu einem bereits eingesammelten Fleck. */
const CELL_VISITED = 2;

/** Das Raster, auf dem gesucht wird — siehe `Background`. */
export interface CandidateGrid {
  /** Rasterbreite in Zellen */
  gridWidth: number;
  /** Rasterhöhe in Zellen */
  gridHeight: number;
  /** Kantenlänge einer Rasterzelle in Bildpunkten */
  step: number;
  /** Größe des Originalbildes in Bildpunkten */
  imageWidth: number;
  imageHeight: number;
}

interface Blob {
  cells: number;
  sumX: number;
  sumY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Sucht in der Abweichungsmaske alle Ball-Kandidaten eines Bildes.
 *
 * Zuerst werden zusammenhängende Flecken eingesammelt (8er-Nachbarschaft),
 * dann nach Größe und Form gefiltert. Ein fliegender Ball ist bei 30 Bildern
 * pro Sekunde ein Streifen und kein Kreis — deshalb prüft die Form nicht auf
 * Rundheit, sondern auf drei Dinge:
 *
 * - **Größe:** zu klein ist Rauschen, zu groß ist eine Person.
 * - **Länge:** die längste Kante darf ein Vielfaches eines Balls betragen,
 *   aber nicht die eines Arms.
 * - **Kompaktheit:** der Fleck muss sein umschließendes Rechteck ausfüllen;
 *   zerfranste Schatten tun das nicht.
 *
 * Die Maske wird dabei verbraucht: eingesammelte Zellen werden markiert.
 */
export function findCandidates(
  mask: Uint8Array,
  stack: Int32Array,
  grid: CandidateGrid,
  settings: FlightSettings,
): BallCandidate[] {
  const { gridWidth, gridHeight, step, imageWidth, imageHeight } = grid;
  const cells = gridWidth * gridHeight;
  const found: BallCandidate[] = [];

  for (let start = 0; start < cells; start++) {
    if (mask[start] !== CELL_FOREGROUND) continue;
    const blob = collect(mask, stack, gridWidth, gridHeight, start);
    const candidate = toCandidate(blob, step, imageWidth, imageHeight, cells, settings);
    if (candidate) found.push(candidate);
  }

  // Größter zuerst — und mehr als eine Handvoll meldet der Kern nicht.
  found.sort((a, b) => b.pixels - a.pixels);
  return found.length > settings.maxCandidates ? found.slice(0, settings.maxCandidates) : found;
}

/** Sammelt einen zusammenhängenden Fleck ab einer Startzelle ein. */
function collect(
  mask: Uint8Array,
  stack: Int32Array,
  gridWidth: number,
  gridHeight: number,
  start: number,
): Blob {
  const blob: Blob = {
    cells: 0,
    sumX: 0,
    sumY: 0,
    minX: gridWidth,
    minY: gridHeight,
    maxX: -1,
    maxY: -1,
  };

  let top = 0;
  stack[top++] = start;
  mask[start] = CELL_VISITED;

  while (top > 0) {
    const current = stack[--top];
    const x = current % gridWidth;
    const y = (current - x) / gridWidth;
    blob.cells++;
    blob.sumX += x;
    blob.sumY += y;
    if (x < blob.minX) blob.minX = x;
    if (x > blob.maxX) blob.maxX = x;
    if (y < blob.minY) blob.minY = y;
    if (y > blob.maxY) blob.maxY = y;

    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= gridHeight) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if ((dx === 0 && dy === 0) || nx < 0 || nx >= gridWidth) continue;
        const neighbor = ny * gridWidth + nx;
        if (mask[neighbor] === CELL_FOREGROUND) {
          mask[neighbor] = CELL_VISITED;
          stack[top++] = neighbor;
        }
      }
    }
  }

  return blob;
}

/** Prüft Größe und Form eines Flecks und rechnet ihn zurück in Bildpunkte. */
function toCandidate(
  blob: Blob,
  step: number,
  imageWidth: number,
  imageHeight: number,
  cells: number,
  settings: FlightSettings,
): BallCandidate | null {
  if (blob.cells < settings.minPixels || blob.cells > settings.maxPixels) return null;

  const boxCells = (blob.maxX - blob.minX + 1) * (blob.maxY - blob.minY + 1);
  const fill = boxCells > 0 ? blob.cells / boxCells : 0;
  if (fill < settings.minFill) return null;

  const left = blob.minX * step;
  const top = blob.minY * step;
  const width = Math.min(imageWidth, (blob.maxX + 1) * step) - left;
  const height = Math.min(imageHeight, (blob.maxY + 1) * step) - top;

  const longSide = Math.max(width, height);
  const shortSide = Math.max(1, Math.min(width, height));
  if (longSide > settings.maxSide) return null;
  const aspect = longSide / shortSide;
  if (aspect > settings.maxAspect) return null;

  return {
    x: (blob.sumX / blob.cells) * step + step / 2,
    y: (blob.sumY / blob.cells) * step + step / 2,
    left,
    top,
    width,
    height,
    pixels: blob.cells,
    coverage: cells > 0 ? blob.cells / cells : 0,
    aspect,
    fill,
  };
}
