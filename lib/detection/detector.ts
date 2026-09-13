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
}

/** Nur der innere Teil des Bechers wird auf Bälle ausgewertet, der Rand stört. */
const INNER_FACTOR = 0.85;
/** Ring um den Becher: Ein Ball fliegt in einem Frame hindurch, eine Hand bleibt dort liegen. */
const RING_INNER_FACTOR = 1.1;
const RING_OUTER_FACTOR = 1.6;
/** So lange bleibt ein Becher nach einer erkannten Hand noch gesperrt. */
const BLOCK_HOLD_MS = 500;
const COLORS: BallColor[] = ["weiss", "orange"];

const ZONE_INNER = 1;
const ZONE_RING = 2;

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

    this.rois = cups.map((cup) => {
      const cx = cup.x * width;
      const cy = cup.y * height;
      const x0 = Math.max(0, Math.floor(cx - outer));
      const y0 = Math.max(0, Math.floor(cy - outer));
      const x1 = Math.min(width - 1, Math.ceil(cx + outer));
      const y1 = Math.min(height - 1, Math.ceil(cy + outer));
      const roiWidth = Math.max(0, x1 - x0 + 1);
      const roiHeight = Math.max(0, y1 - y0 + 1);
      const zones = new Uint8Array(roiWidth * roiHeight);
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
          } else if (d2 >= ringInner2 && d2 <= outer2) {
            zones[y * roiWidth + x] = ZONE_RING;
            ringPixels++;
          }
        }
      }
      return { x0, y0, width: roiWidth, height: roiHeight, zones, innerPixels, ringPixels, reference: null };
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
    // Gleicht die Belichtungsautomatik grob aus: aktuelles Bild auf die Helligkeit der Referenz skalieren.
    const gain =
      this.referenceLuma > 0 ? clamp(this.referenceLuma / Math.max(meanLuma(frame), 1), 0.7, 1.4) : 1;
    const armed = this.hasReference;
    const hits: HitEvent[] = [];

    const cups = this.rois.map((roi, index): CupState => {
      let white = 0;
      let orange = 0;
      let ringChanged = 0;
      const reference = roi.reference;

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
            continue;
          }
          if (!changed) continue;

          const cls = classifyPixel(r, g, b, params.color);
          if (cls === PIXEL_WHITE) white++;
          else if (cls === PIXEL_ORANGE) orange++;
        }
      }

      const levels: Record<BallColor, number> = {
        weiss: roi.innerPixels ? white / roi.innerPixels : 0,
        orange: roi.innerPixels ? orange / roi.innerPixels : 0,
      };
      const edgeChange = reference && roi.ringPixels ? ringChanged / roi.ringPixels : 0;
      const presence = this.presence[index];
      if (edgeChange >= params.handThreshold) presence.blockedUntil = now + BLOCK_HOLD_MS;
      const blocked = now < presence.blockedUntil;

      let present = false;
      let pending = false;
      for (const color of COLORS) {
        const state = presence.colors[color];
        // Während eine Hand im Bereich ist, bleibt der Zustand eingefroren:
        // kein neuer Treffer durch Hautfarbe, kein „Ball weg“ durch Verdecken.
        if (!blocked) {
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
        edgeChange,
        present,
        pending,
        blocked,
      };
    });

    return { cups, hits };
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
