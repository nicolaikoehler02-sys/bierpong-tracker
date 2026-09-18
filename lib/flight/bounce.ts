import { tableYAt } from "./calibration.ts";
import type { FlightSettings } from "./settings.ts";
import type { BouncePoint, FlightPoint, TableLine } from "./types.ts";

/**
 * Ordnet eine Flugbahn ein: Aufsetzer oder direkter Wurf.
 *
 * ## Woran ein Aufsetzer erkannt wird
 *
 * Ein direkter Wurf hat genau einen Scheitel: Der Ball steigt, kippt um und
 * fällt, bis er im Becher oder daneben landet — die senkrechte Bewegung kehrt
 * sich genau einmal um, und zwar oben. Ein Aufsetzer kehrt sie ein zweites Mal
 * um, und zwar **unten**, nahe der Tischplatte, und fliegt danach in einem
 * zweiten, flacheren Bogen weiter.
 *
 * Gesucht wird deshalb ein Punkt der Bahn, an dem der Ball aufhört zu fallen
 * und anfängt zu steigen (im Bild zeigt y nach unten: ein örtliches Maximum von
 * y). Damit daraus ein Aufsetzer wird, müssen vier Dinge zusammenkommen:
 *
 * 1. **Ein echter Abstieg davor** (`minBounceDrop`) — sonst ist es das Zittern
 *    des Schwerpunkts eines bewegungsunscharfen Streifens.
 * 2. **Ein echter Anstieg danach** (`minBounceRise`) — der zweite Bogen.
 * 3. **Genug Bahn danach** (`minBounceRebound` Punkte und
 *    `minBounceReboundSpan` Bildpunkte waagerecht). Das ist die Prüfung, die
 *    den vom Becherrand abprallenden Ball aussortiert: Der prallt am **Ende**
 *    der Bahn ab, springt fast senkrecht hoch und kommt waagerecht nicht mehr
 *    weit. Ein Aufsetzer kommt **vor** dem Becher auf und muss danach noch bis
 *    zum Becher fliegen.
 * 4. **Nahe der Tischebene** (`maxBounceAboveTable`, `maxBounceBelowTable`) —
 *    aber nur, wenn eine Kalibrierung vorliegt. Ohne sie entfällt genau diese
 *    Prüfung, und die Einordnung hängt allein an der Form der Bahn.
 *
 * Gefunden wird die **erste** Umkehr, die alle vier Prüfungen besteht. Ein Ball
 * kann zweimal aufsetzen; für die Frage „war das ein Aufsetzer?" zählt der
 * erste Aufprall, und der ist auch der, der im Overlay interessiert.
 *
 * ## Was ohne Kalibrierung schlechter wird
 *
 * Die Einordnung läuft ohne Kalibrierung vollständig weiter — sie verliert nur
 * die vierte Prüfung, und damit drei Dinge:
 *
 * - **Eine Umkehr mitten in der Luft geht als Aufsetzer durch.** Alles, was die
 *   Form eines Aufsetzers hat, zählt als einer: der Ball, der gegen eine
 *   aufgestellte Tasche oder eine Hand prallt, zwei Bahnen, die falsch
 *   miteinander verkettet wurden, ein Ball, der über einem hohen Becherturm
 *   abspringt. Mit Tischebene fallen genau diese heraus.
 * - **Der Aufsetzpunkt ist nicht einzuordnen.** `tableGap` bleibt `null`; ob
 *   der Ball auf der Platte oder 30 cm darüber umgekehrt ist, steht nirgends.
 * - **Die Schwellen sind nicht nachzuziehen.** Mit Tischebene ließe sich
 *   `minBounceRise` an der gemessenen Aufprallhöhe orientieren; ohne sie bleibt
 *   nur ein fester Wert in Bildpunkten, der für jede Aufnahmegröße neu passen
 *   muss.
 *
 * Nicht schlechter wird: die Erkennung des Aufpralls selbst, sein geschätzter
 * Zeitpunkt und seine Stelle im Bild. Die hängen allein an der Punktfolge.
 *
 * ## Wo das Verfahren an seine Grenzen kommt
 *
 * **Bei 30 Bildern pro Sekunde ist ein flacher Aufsetzer nicht sicher von einem
 * flachen direkten Wurf zu unterscheiden.** Ein Ball, der mit wenig Höhe
 * aufsetzt und flach weiterrutscht, hinterlässt zwischen zwei Bildern kaum
 * einen messbaren Knick: Der Abstieg davor und der Anstieg danach liegen dann
 * beide in der Größenordnung des Schwerpunktrauschens, und beide Antworten sind
 * mit denselben Zahlen zu begründen. Die Schwellen `minBounceDrop` und
 * `minBounceRise` entscheiden diesen Fall zugunsten von „direkt" — lieber ein
 * übersehener Aufsetzer als ein erfundener (siehe die Begründung dort). Das ist
 * eine bewusste Entscheidung und keine Genauigkeit.
 *
 * Genauso wenig lässt sich ein Ball, der vom Becherrand abprallt und danach
 * noch weit fliegt, von einem Aufsetzer unterscheiden, wenn die Kalibrierung
 * fehlt: Beide Bahnen haben dieselbe Form. Mit Kalibrierung hilft die Höhe des
 * Umkehrpunkts — aber nur, wenn der Becherrand weit genug über der Tischebene
 * liegt, und 12 cm Becherhöhe sind im Bild oft weniger als der Spielraum, den
 * die Perspektive ohnehin verlangt.
 */
export function findBounce(
  points: readonly FlightPoint[],
  settings: FlightSettings,
  tableLine: TableLine | null = null,
): BouncePoint | null {
  const approach = Math.max(2, Math.round(settings.minBounceApproach));
  const rebound = Math.max(2, Math.round(settings.minBounceRebound));

  // Vor der Umkehr müssen genug Punkte liegen, dahinter auch, und die Umkehr
  // selbst kommt noch dazu. Kürzere Bahnen sind für die Frage zu kurz — was bei
  // 30 Bildern pro Sekunde einen sehr schnellen, sehr flachen Wurf trifft.
  if (points.length < approach + rebound + 1) return null;

  for (let turn = approach; turn <= points.length - 1 - rebound; turn++) {
    const found = examine(points, turn, settings, tableLine);
    if (found) return found;
  }
  return null;
}

/** Prüft eine einzelne mögliche Umkehrstelle. */
function examine(
  points: readonly FlightPoint[],
  turn: number,
  settings: FlightSettings,
  tableLine: TableLine | null,
): BouncePoint | null {
  const here = points[turn];

  // Der tiefste gesehene Punkt: davor fällt der Ball, danach steigt er. Vorne
  // reicht „nicht höher", damit bei zwei gleich tiefen Punkten der spätere
  // gewählt wird und die Antwort eindeutig bleibt.
  if (here.y < points[turn - 1].y) return null;
  if (points[turn + 1].y >= here.y) return null;

  // Der Abstieg zählt vom höchsten Punkt davor — das ist der Scheitel des
  // ersten Bogens, und damit misst `drop` den ganzen Fall und nicht nur den
  // letzten Schritt.
  const drop = here.y - lowest(points, 0, turn - 1);
  if (drop < settings.minBounceDrop) return null;

  const rise = here.y - lowest(points, turn + 1, points.length - 1);
  if (rise < settings.minBounceRise) return null;

  const reboundSpan = Math.abs(points[points.length - 1].x - here.x);
  if (reboundSpan < settings.minBounceReboundSpan) return null;

  const impact = estimateImpact(points, turn, settings);

  let tableGap: number | null = null;
  if (tableLine) {
    tableGap = tableYAt(tableLine, impact.x) - impact.y;
    // Zu hoch über der Kante: Die Umkehr liegt in der Luft, nicht auf dem
    // Tisch. Zu tief darunter: Der Ball wäre vor oder unter dem Tisch — das
    // gibt es nicht, also ist die Bahn falsch verkettet.
    if (tableGap > settings.maxBounceAboveTable) return null;
    if (tableGap < -settings.maxBounceBelowTable) return null;
  }

  return {
    at: impact.at,
    x: impact.x,
    y: impact.y,
    frameBefore: frameBefore(points, impact.at),
    frameAfter: frameAfter(points, impact.at),
    drop,
    rise,
    reboundSpan,
    tableGap,
  };
}

/**
 * Schätzt Zeitpunkt und Stelle des Aufpralls — **zwischen** zwei Bildern.
 *
 * Bei 30 Bildern pro Sekunde liegt der Aufprall fast nie auf einem Bild. Das
 * einfache Verfahren wäre, den tiefsten gesehenen Punkt zu nehmen; es liegt im
 * Mittel eine halbe Bildzeit daneben, und weil der Ball in dieser Zeit rund
 * einen halben Meter weit fliegt, auch räumlich um ein gutes Stück.
 *
 * Stattdessen wird geschnitten: Der Ball fällt vor dem Aufprall auf einer
 * Geraden (über zwei, drei Bilder ist die Wirkung der Schwerkraft klein gegen
 * den Knick) und steigt danach auf einer anderen. Der Schnittpunkt der beiden
 * Geraden ist der Aufprall — in der Zeit und in der Höhe. Die Stelle im Bild
 * folgt daraus, weil sich der Ball waagerecht gleichmäßig bewegt.
 *
 * **Der tiefste gesehene Punkt selbst geht in keine der beiden Geraden ein.**
 * Fällt der Aufprall zwischen zwei Bilder, gehört dieser Punkt schon zum
 * Rückprall — er in die Fallgerade zu nehmen würde den Knick verschleifen.
 * Herausgelassen ist er in beiden Fällen richtig.
 *
 * **Was dabei bewusst ungenau bleibt:** Eine Sehne durch zwei Punkte einer
 * Parabel ist flacher als die Parabel am Ende dieser Sehne. Beide Geraden
 * unterschätzen deshalb ihre Steigung am Aufprall, und zwar in dieselbe
 * Richtung, weil beide Bögen dieselbe Schwerkraft haben. Auf den **Zeitpunkt**
 * hebt sich das weitgehend auf; die geschätzte **Höhe** fällt systematisch
 * etwas zu hoch aus, der Aufsetzpunkt liegt also im Zweifel ein paar
 * Bildpunkte über der Tischplatte statt darauf. Eine Parabelanpassung wäre
 * genauer, braucht aber je Ast mindestens drei Punkte und reagiert bei drei
 * verrauschten Punkten empfindlicher, als sie gewinnt.
 */
function estimateImpact(
  points: readonly FlightPoint[],
  turn: number,
  settings: FlightSettings,
): { at: number; x: number; y: number } {
  const here = points[turn];
  const fit = Math.max(2, Math.round(settings.bounceFitPoints));

  // Gerechnet wird relativ zum tiefsten gesehenen Punkt: Absolute Sekunden
  // einer langen Aufnahme würden die kleinen Unterschiede auffressen.
  const base = here.at;
  const falling = fitLine(points, Math.max(0, turn - fit), turn - 1, base);
  const rising = fitLine(points, turn + 1, Math.min(points.length - 1, turn + fit), base);

  let at = here.at;
  let y = here.y;
  if (falling && rising && falling.slope - rising.slope > 1e-6) {
    const crossing = (rising.intercept - falling.intercept) / (falling.slope - rising.slope);
    // Der Aufprall liegt zwischen dem Punkt davor und dem Punkt danach. Alles
    // andere ist ein Rechenergebnis ohne Bedeutung — dann bleibt es beim
    // tiefsten gesehenen Punkt.
    const earliest = points[turn - 1].at - base;
    const latest = points[turn + 1].at - base;
    if (crossing >= earliest && crossing <= latest) {
      at = base + crossing;
      y = falling.slope * crossing + falling.intercept;
    }
  }

  // Der Aufprall kann nicht höher liegen als der tiefste gesehene Punkt.
  if (y < here.y) y = here.y;
  return { at, x: xAt(points, at), y };
}

/** Eine Ausgleichsgerade y über der Zeit, gemessen ab `base`. */
function fitLine(
  points: readonly FlightPoint[],
  from: number,
  to: number,
  base: number,
): { slope: number; intercept: number } | null {
  const count = to - from + 1;
  if (count < 2) return null;

  let sumT = 0;
  let sumY = 0;
  let sumTT = 0;
  let sumTY = 0;
  for (let i = from; i <= to; i++) {
    const t = points[i].at - base;
    sumT += t;
    sumY += points[i].y;
    sumTT += t * t;
    sumTY += t * points[i].y;
  }

  const denominator = count * sumTT - sumT * sumT;
  if (Math.abs(denominator) < 1e-12) return null;
  const slope = (count * sumTY - sumT * sumY) / denominator;
  return { slope, intercept: (sumY - slope * sumT) / count };
}

/** Der höchste Punkt eines Abschnitts — im Bild der mit dem kleinsten y. */
function lowest(points: readonly FlightPoint[], from: number, to: number): number {
  let value = points[from].y;
  for (let i = from + 1; i <= to; i++) {
    if (points[i].y < value) value = points[i].y;
  }
  return value;
}

/**
 * Die Stelle im Bild zu einem Zeitpunkt zwischen zwei Bildern.
 *
 * Waagerecht bewegt sich der Ball praktisch gleichmäßig — Luftwiderstand hin
 * oder her, über zwei Bilder ist davon nichts zu messen. Deshalb wird zwischen
 * den beiden umgebenden Punkten geradlinig geteilt.
 */
function xAt(points: readonly FlightPoint[], at: number): number {
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1];
    const after = points[i];
    if (at < before.at || at > after.at) continue;
    const span = after.at - before.at;
    if (span <= 0) return before.x;
    return before.x + ((at - before.at) / span) * (after.x - before.x);
  }
  return at <= points[0].at ? points[0].x : points[points.length - 1].x;
}

function frameBefore(points: readonly FlightPoint[], at: number): number {
  let index = points[0].index;
  for (const point of points) {
    if (point.at <= at) index = point.index;
  }
  return index;
}

function frameAfter(points: readonly FlightPoint[], at: number): number {
  let index = points[points.length - 1].index;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].at >= at) index = points[i].index;
  }
  return index;
}
