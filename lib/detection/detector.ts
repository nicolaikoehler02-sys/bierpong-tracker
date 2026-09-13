import type { BallColor } from "@/db/schema";
import { type ColorParams, PIXEL_ORANGE, PIXEL_WHITE, classifyPixel } from "./color";

/** Bechermitte, normiert auf 0–1 der Bildbreite/-höhe. */
export interface Cup {
  x: number;
  y: number;
}

export interface DetectionParams {
  /** Anteil Ballpixel im Becherbereich, ab dem ein Ball zählt */
  threshold: number;
  /** So viele Analyse-Frames muss der Ball stabil erkannt sein */
  framesOn: number;
  /** So viele Frames muss er weg sein, bis der Becher wieder frei ist */
  framesOff: number;
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
  present: boolean;
  pending: boolean;
}

export interface AnalysisResult {
  cups: CupState[];
  hits: HitEvent[];
}

/** Nur der innere Teil des Bechers wird ausgewertet, der Rand stört. */
const INNER_FACTOR = 0.85;
const COLORS: BallColor[] = ["weiss", "orange"];

interface Roi {
  x0: number;
  y0: number;
  width: number;
  height: number;
  mask: Uint8Array;
  pixels: number;
  reference: Uint8ClampedArray | null;
}

interface Presence {
  on: boolean;
  count: number;
}

export class CupDetector {
  private rois: Roi[] = [];
  private presence: Record<BallColor, Presence>[] = [];
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

    const r = radius * width * INNER_FACTOR;
    const r2 = r * r;
    this.rois = cups.map((cup) => {
      const cx = cup.x * width;
      const cy = cup.y * height;
      const x0 = Math.max(0, Math.floor(cx - r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const x1 = Math.min(width - 1, Math.ceil(cx + r));
      const y1 = Math.min(height - 1, Math.ceil(cy + r));
      const roiWidth = Math.max(0, x1 - x0 + 1);
      const roiHeight = Math.max(0, y1 - y0 + 1);
      const mask = new Uint8Array(roiWidth * roiHeight);
      let pixels = 0;
      for (let y = 0; y < roiHeight; y++) {
        for (let x = 0; x < roiWidth; x++) {
          const dx = x0 + x + 0.5 - cx;
          const dy = y0 + y + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) {
            mask[y * roiWidth + x] = 1;
            pixels++;
          }
        }
      }
      return { x0, y0, width: roiWidth, height: roiHeight, mask, pixels, reference: null };
    });
    this.referenceLuma = 0;
    this.resetPresence();
    return true;
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
    // Gleicht die Belichtungsautomatik grob aus: aktuelles Bild auf die Helligkeit der Referenz skalieren.
    const gain =
      this.referenceLuma > 0 ? clamp(this.referenceLuma / Math.max(meanLuma(frame), 1), 0.7, 1.4) : 1;
    const armed = this.hasReference;
    const hits: HitEvent[] = [];

    const cups = this.rois.map((roi, index): CupState => {
      let white = 0;
      let orange = 0;
      const reference = roi.reference;

      for (let y = 0; y < roi.height; y++) {
        const row = (roi.y0 + y) * frame.width;
        for (let x = 0; x < roi.width; x++) {
          const m = y * roi.width + x;
          if (!roi.mask[m]) continue;
          const p = (row + roi.x0 + x) * 4;
          const r = Math.min(255, data[p] * gain);
          const g = Math.min(255, data[p + 1] * gain);
          const b = Math.min(255, data[p + 2] * gain);
          if (reference) {
            const q = m * 3;
            const change =
              Math.abs(r - reference[q]) + Math.abs(g - reference[q + 1]) + Math.abs(b - reference[q + 2]);
            if (change < params.color.minChange) continue;
          }
          const cls = classifyPixel(r, g, b, params.color);
          if (cls === PIXEL_WHITE) white++;
          else if (cls === PIXEL_ORANGE) orange++;
        }
      }

      const levels: Record<BallColor, number> = {
        weiss: roi.pixels ? white / roi.pixels : 0,
        orange: roi.pixels ? orange / roi.pixels : 0,
      };
      let present = false;
      let pending = false;

      for (const color of COLORS) {
        const state = this.presence[index][color];
        const level = levels[color];
        if (!state.on) {
          if (level >= params.threshold) {
            state.count++;
            if (state.count >= params.framesOn) {
              state.on = true;
              state.count = 0;
              if (armed) hits.push({ cup: index, color, confidence: level, at: now });
            }
          } else {
            state.count = 0;
          }
        } else if (level < params.threshold * 0.5) {
          state.count++;
          if (state.count >= params.framesOff) {
            state.on = false;
            state.count = 0;
          }
        } else {
          state.count = 0;
        }
        present ||= state.on;
        pending ||= !state.on && state.count > 0;
      }

      return {
        white: levels.weiss,
        orange: levels.orange,
        level: Math.max(levels.weiss, levels.orange),
        present,
        pending,
      };
    });

    return { cups, hits };
  }

  private resetPresence(): void {
    this.presence = this.rois.map(() => ({
      weiss: { on: false, count: 0 },
      orange: { on: false, count: 0 },
    }));
  }
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
