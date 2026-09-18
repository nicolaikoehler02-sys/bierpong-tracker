import { describe, expect, it } from "vitest";
import { findBounce } from "./bounce.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { FlightPoint, TableLine } from "./types.ts";

/**
 * Künstliche Bahnen statt Bilder: `findBounce` bekommt eine Punktfolge und
 * gibt eine Einordnung zurück. Genau das ist die Frage dieses Tickets, und an
 * gerechneten Punkten lässt sie sich auf die Millisekunde prüfen — bei
 * gezeichneten Bällen käme die Ungenauigkeit des Schwerpunkts dazu und würde
 * jede Aussage über den Aufsetzzeitpunkt verwischen. Der Weg durch das ganze
 * Bild steht in `detector.test.ts`.
 */
const FPS = 30;
const settings: FlightSettings = { ...defaultFlightSettings, fps: FPS };

/** Die Tischebene dieser Bahnen: waagerecht bei y 300, wie im Testvideo. */
const TABLE: TableLine = { startX: 40, startY: 314, endX: 600, endY: 314 };
const TABLE_Y = 300;

/** Macht aus gerechneten Stellen eine Punktfolge mit Bildnummern und Zeitpunkten. */
function track(spots: readonly { x: number; y: number }[], firstFrame = 10): FlightPoint[] {
  return spots.map((spot, i) => ({
    index: firstFrame + i,
    at: (firstFrame + i) / FPS,
    x: spot.x,
    y: spot.y,
  }));
}

/** Ein Bogen: gleichmäßig zur Seite, Parabel nach oben, Anfang und Ende auf der Tischebene. */
function arc(from: number, to: number, count: number, rise: number, base = TABLE_Y) {
  return Array.from({ length: count }, (_, i) => {
    const u = i / (count - 1);
    return { x: from + (to - from) * u, y: base - 4 * rise * u * (1 - u) };
  });
}

/**
 * Ein Aufsetzer, ausgerechnet über die Zeit statt über den Punktindex.
 *
 * `impactAt` ist der wahre Aufprallzeitpunkt in Sekunden. Nur so lässt sich ein
 * Aufprall bauen, der garantiert **zwischen** zwei Bildern liegt — wird über
 * den Punktindex gerechnet, fällt er immer auf ein Bild.
 */
function bouncePath(options: {
  from: number;
  to: number;
  start: number;
  impactAt: number;
  end: number;
  rise: number;
  rebound: number;
  base?: number;
}): FlightPoint[] {
  const base = options.base ?? TABLE_Y;
  const points: FlightPoint[] = [];
  const firstFrame = Math.ceil(options.start * FPS);
  const lastFrame = Math.floor(options.end * FPS);

  for (let frame = firstFrame; frame <= lastFrame; frame++) {
    const at = frame / FPS;
    const u = (at - options.start) / (options.end - options.start);
    const x = options.from + (options.to - options.from) * u;
    const y =
      at <= options.impactAt
        ? bow(at, options.start, options.impactAt, options.rise, base)
        : bow(at, options.impactAt, options.end, options.rebound, base);
    points.push({ index: frame, at, x, y });
  }
  return points;
}

/** Ein Parabelbogen zwischen zwei Zeitpunkten, beide Enden auf der Tischebene. */
function bow(at: number, start: number, end: number, rise: number, base: number): number {
  const u = (at - start) / (end - start);
  return base - 4 * rise * u * (1 - u);
}

describe("findBounce: Aufsetzer oder direkter Wurf", () => {
  it("ordnet einen direkten Wurf als direkt ein", () => {
    // Ein Bogen, ein Scheitel, danach ist die Bahn zu Ende — nirgends kehrt
    // sich die senkrechte Richtung ein zweites Mal um.
    const points = track(arc(60, 560, 24, 150));

    expect(findBounce(points, settings, TABLE)).toBeNull();
    expect(findBounce(points, settings, null)).toBeNull();
  });

  it("erkennt einen Aufsetzer und nennt Zeitpunkt und Stelle des Aufpralls", () => {
    // Aufprall genau auf einem Bild: 1,0 s sind bei 30 Bildern pro Sekunde
    // Bild 30.
    const points = bouncePath({
      from: 60,
      to: 560,
      start: 0.5,
      impactAt: 1.0,
      end: 1.5,
      rise: 150,
      rebound: 55,
    });
    const bounce = findBounce(points, settings, TABLE);

    expect(bounce).not.toBeNull();
    if (!bounce) return;
    expect(bounce.at).toBeCloseTo(1.0, 2);
    // Auf halber Strecke zwischen 60 und 560.
    expect(bounce.x).toBeGreaterThan(290);
    expect(bounce.x).toBeLessThan(320);
    // Der Aufprall liegt auf der Tischebene, die Schätzung etwas darüber.
    expect(bounce.y).toBeGreaterThan(TABLE_Y - 20);
    expect(bounce.y).toBeLessThanOrEqual(TABLE_Y + 2);
    expect(bounce.drop).toBeGreaterThan(100);
    expect(bounce.rise).toBeGreaterThan(40);
    expect(bounce.tableGap).not.toBeNull();
  });

  it("schätzt einen Aufprall genau zwischen zwei Bildern auf die halbe Bildzeit", () => {
    // Bild 30 liegt bei 1,000 s, Bild 31 bei 1,0333 s. Der wahre Aufprall liegt
    // bei 1,0167 s — in keinem einzigen Bild zu sehen.
    const impactAt = 30.5 / FPS;
    const points = bouncePath({
      from: 60,
      to: 560,
      start: 0.5,
      impactAt,
      end: 1.5,
      rise: 150,
      rebound: 55,
    });
    const bounce = findBounce(points, settings, TABLE);

    expect(bounce).not.toBeNull();
    if (!bounce) return;

    // Das nächstgelegene Bild läge eine halbe Bildzeit daneben — 0,0167 s. Die
    // Schätzung bleibt unter einem Zehntel davon; der Rest ist die im Code
    // beschriebene Sehnenverzerrung und keine Ungenauigkeit der Daten.
    expect(Math.abs(bounce.at - impactAt)).toBeLessThan(0.1 / FPS);
    // Und sie liegt wirklich zwischen den Bildern, nicht auf einem.
    expect(Math.abs(bounce.at - 30 / FPS)).toBeGreaterThan(0.3 / FPS);
    expect(Math.abs(bounce.at - 31 / FPS)).toBeGreaterThan(0.3 / FPS);
    expect(bounce.frameBefore).toBe(30);
    expect(bounce.frameAfter).toBe(31);

    // Und die Stelle liegt entsprechend zwischen den beiden Bildstellen.
    const before = points.find((point) => point.index === 30);
    const after = points.find((point) => point.index === 31);
    expect(bounce.x).toBeGreaterThan(before?.x ?? 0);
    expect(bounce.x).toBeLessThan(after?.x ?? 0);
  });

  it("erkennt denselben Aufsetzer auch ohne Kalibrierung", () => {
    // Ohne Tischebene bleibt nur die Form der Bahn — sie reicht für diesen Fall.
    const points = bouncePath({
      from: 60,
      to: 560,
      start: 0.5,
      impactAt: 1.02,
      end: 1.5,
      rise: 150,
      rebound: 55,
    });

    const mit = findBounce(points, settings, TABLE);
    const ohne = findBounce(points, settings, null);

    expect(ohne).not.toBeNull();
    expect(ohne?.at).toBeCloseTo(mit?.at ?? 0, 6);
    expect(ohne?.x).toBeCloseTo(mit?.x ?? 0, 6);
    // Nur der Abstand zur Tischebene fehlt — den gibt es ohne Kalibrierung nicht.
    expect(ohne?.tableGap).toBeNull();
    expect(mit?.tableGap).not.toBeNull();
  });

  it("macht aus einem Wurf, der knapp über der Tischebene durchfliegt, keinen Aufsetzer", () => {
    // Flach über den Tisch, aber ohne Berührung: Der Ball fällt durchgehend,
    // der Scheitel liegt am Anfang. Es gibt keine zweite Umkehr.
    const points = track(
      Array.from({ length: 22 }, (_, i) => {
        const u = i / 21;
        return { x: 60 + 500 * u, y: TABLE_Y - 40 + 35 * u * u };
      }),
    );

    expect(findBounce(points, settings, TABLE)).toBeNull();
    expect(findBounce(points, settings, null)).toBeNull();
  });

  it("macht aus einem Ball, der am Ende vom Becherrand abprallt, keinen Aufsetzer", () => {
    // Bogen bis kurz vor den Becher, dann prallt der Ball am Rand fast
    // senkrecht hoch: Der Abprall liegt am Ende der Bahn, und waagerecht geht
    // es danach kaum noch weiter.
    const flight = arc(60, 520, 20, 150);
    const rim = [
      { x: 526, y: TABLE_Y - 14 },
      { x: 530, y: TABLE_Y - 30 },
      { x: 533, y: TABLE_Y - 38 },
    ];
    const points = track([...flight, ...rim]);

    expect(findBounce(points, settings, TABLE)).toBeNull();
    expect(findBounce(points, settings, null)).toBeNull();
  });

  it("verwirft eine Umkehr mitten in der Luft, wenn die Tischebene bekannt ist", () => {
    // Dieselbe Form wie ein Aufsetzer, aber 150 Bildpunkte über dem Tisch —
    // dort setzt nichts auf. Ohne Kalibrierung ist dieser Fall nicht zu
    // erkennen; das ist genau der Unterschied, den die Kalibrierung macht.
    const points = bouncePath({
      from: 60,
      to: 560,
      start: 0.5,
      impactAt: 1.0,
      end: 1.5,
      rise: 90,
      rebound: 45,
      base: TABLE_Y - 150,
    });

    expect(findBounce(points, settings, TABLE)).toBeNull();
    expect(findBounce(points, settings, null)).not.toBeNull();
  });

  it("hält ein zitterndes Schwerpunktsignal nicht für einen Aufsetzer", () => {
    // Ein bewegungsunscharfer Streifen lässt den Schwerpunkt um ein paar
    // Bildpunkte wandern. Abstieg und Anstieg bleiben unter den Schwellen.
    const wobble = [0, 3, -2, 4, -3, 2, -4, 3, -2, 4, -3, 2, 0, 3, -2, 4];
    const points = track(
      wobble.map((offset, i) => ({ x: 60 + i * 30, y: TABLE_Y - 60 + offset })),
    );

    expect(findBounce(points, settings, null)).toBeNull();
  });

  it("gibt bei einer zu kurzen Bahn keine Einordnung als Aufsetzer", () => {
    // Fünf Punkte sind das Minimum für einen Wurf, reichen aber nicht für
    // zwei Bögen mit einem Knick dazwischen. Bei 30 Bildern pro Sekunde
    // betrifft das sehr schnelle, sehr flache Würfe — dort ist die Frage
    // ehrlich nicht zu beantworten, und die Antwort lautet „direkt".
    const points = track([
      { x: 60, y: 260 },
      { x: 160, y: 285 },
      { x: 260, y: 299 },
      { x: 360, y: 288 },
      { x: 460, y: 268 },
    ]);

    expect(findBounce(points, settings, null)).toBeNull();
  });

  it("nimmt bei zwei Aufprallen den ersten", () => {
    const first = bouncePath({
      from: 60,
      to: 330,
      start: 0.5,
      impactAt: 1.0,
      end: 1.3,
      rise: 150,
      rebound: 60,
    });
    const second = bouncePath({
      from: 340,
      to: 560,
      start: 1.333,
      impactAt: 1.5,
      end: 1.8,
      rise: 60,
      rebound: 25,
    });
    const bounce = findBounce([...first, ...second], settings, TABLE);

    expect(bounce).not.toBeNull();
    expect(bounce?.at).toBeCloseTo(1.0, 2);
  });
});
