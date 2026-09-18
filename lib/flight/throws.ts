import { pixelsPerSecondToMetersPerSecond, pixelsToCm } from "./calibration.ts";
import type { FlightSettings } from "./settings.ts";
import type { FlightTrack } from "./tracks.ts";
import type { FlightPoint, FlightScale, Throw, ThrowMetrics } from "./types.ts";

/**
 * Behält von allen Flugbahnen nur die, die einen Wurf beschreiben.
 *
 * Geprüft wird vier Mal, und jede Prüfung wirft einen bestimmten Fehler hinaus:
 *
 * 1. **Mindestlänge** — eine Bahn aus zwei, drei Punkten ist ein Schatten, der
 *    kurz aufgeflackert ist.
 * 2. **Mindeststrecke** — ein Ball, der über den Tisch fliegt, legt waagerecht
 *    eine ordentliche Strecke zurück. Eine zuckende Hand tut das nicht.
 * 3. **Durchgehende waagerechte Richtung** — ein geworfener Ball kehrt in der
 *    Luft nicht um. Was hin und her wandert, ist eine Person oder ein Fleck,
 *    der zwischen zwei Stellen springt.
 * 4. **Plausible Geschwindigkeit** — hier fällt der zurückrollende Ball heraus:
 *    Er ist langsam, läuft flach und oft in die Gegenrichtung. Nach oben
 *    begrenzt dieselbe Prüfung Bahnen, die aus zwei fremden Flecken
 *    zusammengesetzt wurden.
 *
 * Aus der Richtung ergibt sich die Seite: Ein Flug von links nach rechts kommt
 * vom linken Werfer, und umgekehrt. Namen kennt der Kern bewusst nicht.
 *
 * Der Maßstab kommt erst ganz am Ende dazu und nur für die Kennzahlen: Keine
 * der vier Prüfungen sieht ihn an. Genau deshalb erkennt der Kern ohne
 * Kalibrierung dieselben Würfe wie mit — nur eben in Bildpunkten.
 */
export function toThrows(
  tracks: readonly FlightTrack[],
  settings: FlightSettings,
  scale: FlightScale | null = null,
): Throw[] {
  const throws: Throw[] = [];
  for (const track of tracks) {
    const found = toThrow(track, settings, scale);
    if (found) throws.push(found);
  }

  throws.sort((a, b) => a.startedAt - b.startedAt || a.startFrame - b.startFrame);
  throws.forEach((found, index) => {
    found.nr = index + 1;
  });
  return throws;
}

/** Prüft eine einzelne Bahn und rechnet ihre Kennzahlen aus. */
function toThrow(
  track: FlightTrack,
  settings: FlightSettings,
  scale: FlightScale | null,
): Throw | null {
  const points = track.points;
  if (points.length < settings.minThrowPoints) return null;

  const first = points[0];
  const last = points[points.length - 1];

  const spanX = last.x - first.x;
  if (Math.abs(spanX) < settings.minThrowSpan) return null;

  // Die Gesamtrichtung gibt vor, wohin es geht; kein Schritt darf ihr
  // nennenswert entgegenlaufen.
  const direction = spanX > 0 ? 1 : -1;
  for (let i = 1; i < points.length; i++) {
    const step = (points[i].x - points[i - 1].x) * direction;
    if (step < -settings.maxReverseStep) return null;
  }

  const duration = last.at - first.at;
  if (duration <= 0) return null;

  const speedX = Math.abs(spanX) / duration;
  if (speedX < settings.minThrowSpeed || speedX > settings.maxThrowSpeed) return null;

  return {
    nr: 0,
    startedAt: first.at,
    endedAt: last.at,
    startFrame: first.index,
    endFrame: last.index,
    side: direction > 0 ? "links" : "rechts",
    points: points.slice(),
    metrics: measure(points, duration, Math.abs(spanX), scale),
  };
}

/**
 * Die Kennzahlen einer Flugbahn — immer in Bildpunkten, mit Kalibrierung
 * zusätzlich in Zentimetern und Metern je Sekunde.
 *
 * Die Scheitelhöhe zählt vom Abwurfpunkt aus nach oben. Die Bildpunkt-Werte
 * bleiben auch mit Kalibrierung stehen: Sie sind die gemessenen Zahlen, die
 * Zentimeter nur die daraus abgeleiteten. Wird später ein anderer Maßstab
 * angesetzt, muss dafür nichts neu ausgewertet werden.
 */
function measure(
  points: readonly FlightPoint[],
  duration: number,
  span: number,
  scale: FlightScale | null,
): ThrowMetrics {
  let distance = 0;
  let peak = points[0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    distance += Math.sqrt(dx * dx + dy * dy);
    // Im Bild zeigt y nach unten: Der höchste Punkt hat das kleinste y.
    if (points[i].y < peak.y) peak = points[i];
  }

  const peakHeight = Math.max(0, points[0].y - peak.y);
  const speed = distance / duration;
  const speedX = span / duration;

  const metrics: ThrowMetrics = {
    duration,
    peakHeight,
    peakAt: peak.at,
    distance,
    span,
    speed,
    speedX,
  };
  if (!scale) return metrics;

  // Achtung: Der Maßstab gilt in der Ebene der vorderen Tischkante, der Ball
  // fliegt aber rund eine halbe Tischbreite dahinter. Alle folgenden Werte
  // fallen dadurch systematisch etwas zu klein aus — die Größenordnung des
  // Fehlers steht bei `toScale` in `calibration.ts`.
  metrics.peakHeightCm = pixelsToCm(peakHeight, scale);
  metrics.distanceCm = pixelsToCm(distance, scale);
  metrics.spanCm = pixelsToCm(span, scale);
  metrics.speedMps = pixelsPerSecondToMetersPerSecond(speed, scale);
  metrics.speedXMps = pixelsPerSecondToMetersPerSecond(speedX, scale);
  return metrics;
}
