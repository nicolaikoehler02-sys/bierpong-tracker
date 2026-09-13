export interface ColorParams {
  /** Weißer Ball: maximale Sättigung (0–1) */
  whiteMaxSat: number;
  /** Weißer Ball: minimale Helligkeit (0–1) */
  whiteMinVal: number;
  /** Oranger Ball: Farbton-Bereich in Grad */
  orangeHueMin: number;
  orangeHueMax: number;
  orangeMinSat: number;
  orangeMinVal: number;
  /** Mindest-Farbabstand zur Leer-Referenz (Summe über R, G, B) */
  minChange: number;
}

export const defaultColorParams: ColorParams = {
  whiteMaxSat: 0.25,
  whiteMinVal: 0.7,
  orangeHueMin: 12,
  orangeHueMax: 45,
  orangeMinSat: 0.45,
  orangeMinVal: 0.4,
  minChange: 60,
};

export const PIXEL_NONE = 0;
export const PIXEL_WHITE = 1;
export const PIXEL_ORANGE = 2;

export function classifyPixel(r: number, g: number, b: number, params: ColorParams): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const value = max / 255;
  const saturation = max === 0 ? 0 : delta / max;

  if (saturation <= params.whiteMaxSat && value >= params.whiteMinVal) return PIXEL_WHITE;

  if (delta > 0 && saturation >= params.orangeMinSat && value >= params.orangeMinVal) {
    let hue: number;
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
    if (hue >= params.orangeHueMin && hue <= params.orangeHueMax) return PIXEL_ORANGE;
  }

  return PIXEL_NONE;
}
