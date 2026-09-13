export interface ProportionEstimate {
  /** Gemessene Quote */
  p: number;
  /** Untere Grenze des 95-%-Bereichs */
  low: number;
  /** Obere Grenze des 95-%-Bereichs */
  high: number;
}

/**
 * Quote mit 95-%-Konfidenzintervall nach Wilson.
 * Robuster als die Normalapproximation bei kleinen Stichproben und Quoten nahe 0 oder 1.
 */
export function wilson(successes: number, trials: number, z = 1.96): ProportionEstimate | null {
  if (trials <= 0) return null;
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return { p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export interface Counts {
  successes: number;
  trials: number;
}

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const shifted = z - 1;
  let sum = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) sum += LANCZOS[i] / (shifted + i + 1);
  const t = shifted + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** Kettenbruch für die unvollständige Betafunktion (Numerical Recipes). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    result *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < 3e-14) break;
  }
  return result;
}

/** Verteilungsfunktion der Beta-Verteilung. */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + logGamma(a + b) - logGamma(a) - logGamma(b));
}

/** Wahrscheinlichkeit, dass die wahre Quote über einer Schwelle liegt (gleichverteiltes Vorwissen). */
export function probabilityAbove(counts: Counts, threshold: number): number {
  return 1 - betaCdf(threshold, 1 + counts.successes, 1 + counts.trials - counts.successes);
}

/** Wahrscheinlichkeit, dass Quote A größer ist als Quote B (gleichverteiltes Vorwissen). */
export function probabilityGreater(a: Counts, b: Counts, steps = 400): number {
  const alphaA = 1 + a.successes;
  const betaA = 1 + a.trials - a.successes;
  const alphaB = 1 + b.successes;
  const betaB = 1 + b.trials - b.successes;
  // Simpson-Regel für ∫ f_A(x) · F_B(x) dx
  const h = 1 / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const x = i * h;
    const weight = i === 0 || i === steps ? 1 : i % 2 ? 4 : 2;
    sum += weight * betaPdf(x, alphaA, betaA) * betaCdf(x, alphaB, betaB);
  }
  return Math.min(1, Math.max(0, (sum * h) / 3));
}

/** Längste Serie von Treffern ohne Fehlwurf in einer zeitlich sortierten Ereignisliste. */
export function longestStreak(kinds: string[]): number {
  let best = 0;
  let current = 0;
  for (const kind of kinds) {
    if (kind === "hit") {
      current++;
      best = Math.max(best, current);
    } else if (kind === "miss") {
      current = 0;
    }
  }
  return best;
}
