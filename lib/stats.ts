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
