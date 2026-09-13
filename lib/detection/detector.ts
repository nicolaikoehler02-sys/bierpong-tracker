import type { BallColor } from "@/db/schema";
import { type ColorParams, PIXEL_NONE, PIXEL_ORANGE, PIXEL_WHITE, classifyPixel } from "./color";

/** Bechermitte, normiert auf 0–1 der Bildbreite/-höhe. */
export interface Cup {
  x: number;
  y: number;
}

export interface DetectionParams {
  /** Größe des größten Ballflecks relativ zur Becherfläche, ab der ein Ball zählt */
  threshold: number;
  /** So viele Analyse-Frames muss der Ball stabil erkannt sein */
  framesOn: number;
  /** So viele Frames muss er weg sein, bis der Becher wieder frei ist */
  framesOff: number;
  /** Anteil veränderter Pixel im Ring um den Becher, ab dem eine Hand/ein Arm angenommen wird */
  handThreshold: number;
  color: ColorParams;
}

export interface HitEvent {
  cup: number;
  color: BallColor;
  confidence: number;
  at: number;
}

export interface CupState {
  white: number;
  orange: number;
  level: number;
  /** Anteil veränderter Pixel im Ring um den Becher */
  edgeChange: number;
  present: boolean;
  pending: boolean;
  /** Hand oder Arm im Bereich — Zustand eingefroren */
  blocked: boolean;
}

export interface AnalysisResult {
  cups: CupState[];
  hits: HitEvent[];
  /** Ganzes Bild weicht stark von der Referenz ab — dann wird nichts gezählt */
  sceneChanged: boolean;
}

/** Darunter gilt das Bild als schwarz (mittlere Helligkeit 0–255). */
const DARK_LUMA = 12;
/** Helligkeit gegenüber der Referenz außerhalb dieses Bereichs = Licht oder Kamera hat sich verändert. */
const SCENE_RATIO_MIN = 0.55;
const SCENE_RATIO_MAX = 1.8;

/**
 * Ausgewertet wird die ganze Becheröffnung, damit auch Bälle am Rand vollständig zählen.
 * Den statischen Becherrand filtert der Vergleich mit der Leer-Referenz.
 */
const INNER_FACTOR = 1;
/** Ring um den Becher: Ein Ball fliegt in einem Frame hindurch, eine Hand bleibt dort liegen. */
const RING_INNER_FACTOR = 1.1;
const RING_OUTER_FACTOR = 1.6;
/** So lange bleibt ein Becher nach einer erkannten Hand noch gesperrt. */
const BLOCK_HOLD_MS = 500;
const COLORS: BallColor[] = ["weiss", "orange"];

const ZONE_INNER = 1;
const ZONE_RING = 2;
const LABEL_VISITED = 255;

interface Roi {
  x0: number;
  y0: number;
  width: number;
  height: number;
  /** 0 = ignorieren, 1 = Becherinneres, 2 = Ring */
  zones: Uint8Array;
  innerPixels: number;
  ringPixels: number;
  reference: Uint8ClampedArray | null;
  /** Arbeitspuffer: Pixelklasse je Position, wird pro Frame neu gefüllt */
  labels: Uint8Array;
  /** Arbeitspuffer für die Fleck-Suche */
  stack: Int32Array;
}

interface CupPresence {
  colors: Record<BallColor, { on: boolean; count: number }>;
  blockedUntil: number;
}

export class CupDetector {
  private rois: Roi[] = [];
  private presence: CupPresence[] = [];
  private layoutCups: Cup[] | null = null;
  private layoutRadius = 0;
  private layoutWidth = 0;
  private layoutHeight = 0;
  private referenceLuma = 0;

  get hasReference(): boolean {
    return this.rois.length > 0 && this.rois.every((roi) => roi.reference !== null);
  }

  /**
   * Baut die Becherbereiche neu, wenn sich Becher, Radius oder Bildgröße geändert haben.
   * Gibt true zurück, wenn neu gebaut wurde — die Referenz ist dann verworfen.
   */
  ensureLayout(cups: Cup[], radius: number, width: number, height: number): boolean {
    if (
      cups === this.layoutCups &&
      radius === this.layoutRadius &&
      width === this.layoutWidth &&
      height === this.layoutHeight
    ) {
      return false;
    }
    this.layoutCups = cups;
    this.layoutRadius = radius;
    this.layoutWidth = width;
    this.layoutHeight = height;

    const cupRadius = radius * width;
    const inner2 = (cupRadius * INNER_FACTOR) ** 2;
    const ringInner2 = (cupRadius * RING_INNER_FACTOR) ** 2;
    const outer = cupRadius * RING_OUTER_FACTOR;
    const outer2 = outer ** 2;

    const centers = cups.map((cup) => ({ x: cup.x * width, y: cup.y * height }));

    this.rois = cups.map((cup, index) => {
      const cx = cup.x * width;
      const cy = cup.y * height;
      const x0 = Math.max(0, Math.floor(cx - outer));
      const y0 = Math.max(0, Math.floor(cy - outer));
      const x1 = Math.min(width - 1, Math.ceil(cx + outer));
      const y1 = Math.min(height - 1, Math.ceil(cy + outer));
      const roiWidth = Math.max(0, x1 - x0 + 1);
      const roiHeight = Math.max(0, y1 - y0 + 1);
      const size = roiWidth * roiHeight;
      const zones = new Uint8Array(size);
      let innerPixels = 0;
      let ringPixels = 0;
      for (let y = 0; y < roiHeight; y++) {
        for (let x = 0; x < roiWidth; x++) {
          const dx = x0 + x + 0.5 - cx;
          const dy = y0 + y + 0.5 - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 <= inner2) {
            zones[y * roiWidth + x] = ZONE_INNER;
            innerPixels++;
          } else if (
            d2 >= ringInner2 &&
            d2 <= outer2 &&
            !insideOtherCup(centers, index, x0 + x + 0.5, y0 + y + 0.5, ringInner2)
          ) {
            zones[y * roiWidth + x] = ZONE_RING;
            ringPixels++;
          }
        }
      }
      return {
        x0,
        y0,
        width: roiWidth,
        height: roiHeight,
        zones,
        innerPixels,
        ringPixels,
        reference: null,
        labels: new Uint8Array(size),
        stack: new Int32Array(size),
      };
    });
    this.resetReference();
    return true;
  }

  /** Verwirft die Referenz, z. B. nach Zoom- oder Lichtänderung. */
  resetReference(): void {
    for (const roi of this.rois) roi.reference = null;
    this.referenceLuma = 0;
    this.resetPresence();
  }

  /** Speichert das Bild der leeren Becher als Vergleichsbasis. */
  captureReference(frame: ImageData): void {
    this.referenceLuma = meanLuma(frame);
    for (const roi of this.rois) {
      const reference = new Uint8ClampedArray(roi.width * roi.height * 3);
      for (let y = 0; y < roi.height; y++) {
        const row = (roi.y0 + y) * frame.width;
        for (let x = 0; x < roi.width; x++) {
          const p = (row + roi.x0 + x) * 4;
          const q = (y * roi.width + x) * 3;
          reference[q] = frame.data[p];
          reference[q + 1] = frame.data[p + 1];
          reference[q + 2] = frame.data[p + 2];
        }
      }
      roi.reference = reference;
    }
    this.resetPresence();
  }

  analyze(frame: ImageData, params: DetectionParams, now: number): AnalysisResult {
    const data = frame.data;
    const luma = meanLuma(frame);
    const ratio = this.referenceLuma > 0 ? luma / Math.max(this.referenceLuma, 1) : 1;
    const sceneChanged =
      this.referenceLuma > 0 && (luma < DARK_LUMA || ratio < SCENE_RATIO_MIN || ratio > SCENE_RATIO_MAX);
    // Gleicht die Belichtungsautomatik grob aus: aktuelles Bild auf die Helligkeit der Referenz skalieren.
    const gain = this.referenceLuma > 0 ? clamp(this.referenceLuma / Math.max(luma, 1), 0.7, 1.4) : 1;
    const armed = this.hasReference;
    const hits: HitEvent[] = [];

    const cups = this.rois.map((roi, index): CupState => {
      let ringChanged = 0;
      const { reference, labels } = roi;
      labels.fill(PIXEL_NONE);

      for (let y = 0; y < roi.height; y++) {
        const row = (roi.y0 + y) * frame.width;
        for (let x = 0; x < roi.width; x++) {
          const m = y * roi.width + x;
          const zone = roi.zones[m];
          if (!zone) continue;
          const p = (row + roi.x0 + x) * 4;
          const r = Math.min(255, data[p] * gain);
          const g = Math.min(255, data[p + 1] * gain);
          const b = Math.min(255, data[p + 2] * gain);

          let changed = true;
          if (reference) {
            const q = m * 3;
            const change =
              Math.abs(r - reference[q]) + Math.abs(g - reference[q + 1]) + Math.abs(b - reference[q + 2]);
            changed = change >= params.color.minChange;
          }

          if (zone === ZONE_RING) {
            if (reference && changed) ringChanged++;
          } else if (changed) {
            labels[m] = classifyPixel(r, g, b, params.color);
          }
        }
      }

      // Nur der größte zusammenhängende Fleck zählt: Der Ball ist ein Fleck,
      // Spiegelungen im Wasser sind verstreute Einzelpixel.
      const levels: Record<BallColor, number> = {
        weiss: roi.innerPixels ? largestBlob(roi, PIXEL_WHITE) / roi.innerPixels : 0,
        orange: roi.innerPixels ? largestBlob(roi, PIXEL_ORANGE) / roi.innerPixels : 0,
      };
      const edgeChange = reference && roi.ringPixels ? ringChanged / roi.ringPixels : 0;
      const presence = this.presence[index];
      if (edgeChange >= params.handThreshold) presence.blockedUntil = now + BLOCK_HOLD_MS;
      // Bei stark verändertem Gesamtbild ebenfalls einfrieren — sonst entstehen Fehltreffer.
      const blocked = sceneChanged || now < presence.blockedUntil;

      let present = false;
      let pending = false;
      for (const color of COLORS) {
        const state = presence.colors[color];
        // Während eine Hand im Bereich ist, bleibt der Zustand eingefroren:
        // kein neuer Treffer durch Hautfarbe, kein „Ball weg“ durch Verdecken.
        if (blocked) {
          state.count = 0;
        } else {
          const level = levels[color];
          // Zähler steigt bei passendem Frame und sinkt bei unpassendem nur um eins,
          // damit ein einzelner schwacher Frame die Erkennung nicht neu startet.
          const matches = state.on ? level < params.threshold * 0.5 : level >= params.threshold;
          state.count = matches ? state.count + 1 : Math.max(0, state.count - 1);

          if (!state.on && state.count >= params.framesOn) {
            state.on = true;
            state.count = 0;
            if (armed) hits.push({ cup: index, color, confidence: level, at: now });
          } else if (state.on && state.count >= params.framesOff) {
            state.on = false;
            state.count = 0;
          }
        }
        present ||= state.on;
        pending ||= !state.on && state.count > 0;
      }

      return {
        white: levels.weiss,
        orange: levels.orange,
        level: Math.max(levels.weiss, levels.orange),
        edgeChange,
        present,
        pending,
        blocked,
      };
    });

    return { cups, hits, sceneChanged };
  }

  private resetPresence(): void {
    this.presence = this.rois.map(() => ({
      colors: {
        weiss: { on: false, count: 0 },
        orange: { on: false, count: 0 },
      },
      blockedUntil: 0,
    }));
  }
}

/**
 * Ring-Pixel, die in einem Nachbarbecher liegen, gehören nicht zum Ring:
 * Dort landen Bälle und spiegelt Wasser — das soll keine Hand-Sperre auslösen.
 */
function insideOtherCup(
  centers: Array<{ x: number; y: number }>,
  self: number,
  px: number,
  py: number,
  radius2: number,
): boolean {
  for (let i = 0; i < centers.length; i++) {
    if (i === self) continue;
    const dx = px - centers[i].x;
    const dy = py - centers[i].y;
    if (dx * dx + dy * dy <= radius2) return true;
  }
  return false;
}

/** Größe des größten zusammenhängenden Flecks einer Pixelklasse (8er-Nachbarschaft). */
function largestBlob(roi: Roi, target: number): number {
  const { labels, stack, width, height } = roi;
  let best = 0;
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] !== target) continue;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = LABEL_VISITED;
    while (top > 0) {
      const current = stack[--top];
      size++;
      const x = current % width;
      const y = (current - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (labels[neighbor] === target) {
            labels[neighbor] = LABEL_VISITED;
            stack[top++] = neighbor;
          }
        }
      }
    }
    if (size > best) best = size;
  }
  return best;
}

function meanLuma(frame: ImageData): number {
  const data = frame.data;
  let sum = 0;
  let count = 0;
  // Jedes 4. Pixel reicht für den Mittelwert.
  for (let p = 0; p < data.length; p += 16) {
    sum += 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    count++;
  }
  return count ? sum / count : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
