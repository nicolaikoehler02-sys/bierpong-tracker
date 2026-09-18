import { describe, expect, it } from "vitest";
import { analyzeFlight } from "./detector.ts";
import { type Rgb, createFrame, fillDisc, fillRect } from "./frame.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { FlightFrame, FrameResult, TableCalibration } from "./types.ts";

const WIDTH = 240;
const HEIGHT = 180;
/** Dunkle Holzwand */
const BACKGROUND: Rgb = [24, 18, 12];
/** Umgeschaltetes Licht */
const BRIGHT: Rgb = [150, 150, 150];
const BALL: Rgb = [250, 250, 250];
/** Kleidung einer Person — deutlich heller als die Wand, aber kein Ball */
const PERSON: Rgb = [140, 130, 120];
const BALL_RADIUS = 6;

/**
 * Kurze Lernphase, damit die künstlichen Bildfolgen kurz bleiben:
 * 0,2 Sekunden bei 30 Bildern pro Sekunde sind 6 Bilder.
 */
const settings: FlightSettings = { ...defaultFlightSettings, fps: 30, backgroundSeconds: 0.2 };
const LEARN_FRAMES = 6;

/** Ein Bild des leeren Tisches. */
function empty(color: Rgb = BACKGROUND): FlightFrame {
  return createFrame(WIDTH, HEIGHT, color);
}

/** Leerer Vorlauf, aus dem der Hintergrund gelernt wird — plus etwas Luft danach. */
function lead(count = LEARN_FRAMES + 2, color: Rgb = BACKGROUND): FlightFrame[] {
  return Array.from({ length: count }, () => empty(color));
}

/** Ein gezeichneter Ball auf dem leeren Tisch. */
function withBall(x: number, y: number, color: Rgb = BACKGROUND): FlightFrame {
  const frame = empty(color);
  fillDisc(frame, x, y, BALL_RADIUS, BALL);
  return frame;
}

function candidateCount(results: readonly FrameResult[]): number {
  return results.reduce((sum, result) => sum + result.candidates.length, 0);
}

/** Nur die Ergebnisse je Bild — für alles, was den Kandidatenschritt prüft. */
function framesOf(frames: readonly FlightFrame[]): FrameResult[] {
  return analyzeFlight(frames, settings).frames;
}

describe("analyzeFlight: Kandidaten je Bild", () => {
  it("meldet je Bild ein Ergebnis mit Zeitpunkt aus den Bildern pro Sekunde", () => {
    const results = framesOf(lead(6));

    expect(results).toHaveLength(6);
    expect(results.map((result) => result.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(results[3].at).toBeCloseTo(3 / 30, 6);
  });

  it("lernt den Hintergrund aus dem leeren Vorlauf und meldet solange nichts", () => {
    const results = framesOf(lead(10));

    expect(results.slice(0, LEARN_FRAMES).every((result) => result.learning)).toBe(true);
    expect(results.slice(LEARN_FRAMES).every((result) => result.learning)).toBe(false);
    expect(candidateCount(results)).toBe(0);
    expect(results.every((result) => result.sceneChanged === false)).toBe(true);
  });

  it("findet den gezeichneten Ball als Kandidaten an seiner tatsächlichen Stelle", () => {
    const path = Array.from({ length: 8 }, (_, i) => ({ x: 30 + i * 22, y: 40 + i * 12 }));
    const frames = [...lead(), ...path.map((point) => withBall(point.x, point.y))];
    const results = framesOf(frames);

    path.forEach((point, i) => {
      const result = results[lead().length + i];
      expect(result.candidates, `Bild ${i} ohne Kandidaten`).toHaveLength(1);
      // Gegen den gelernten Hintergrund fällt nur die aktuelle Ballposition auf,
      // nicht zusätzlich die des vorherigen Bildes.
      expect(Math.abs(result.candidates[0].x - point.x)).toBeLessThan(3);
      expect(Math.abs(result.candidates[0].y - point.y)).toBeLessThan(3);
      expect(result.sceneChanged).toBe(false);
    });
  });

  it("lässt einen bewegungsunscharfen Streifen als Ball durchgehen", () => {
    const streak = empty();
    // Ein Ball ist bei 30 Bildern pro Sekunde in die Länge gezogen.
    fillRect(streak, 80, 60, 30, 10, BALL);
    const results = framesOf([...lead(), streak]);

    const candidates = results[results.length - 1].candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].aspect).toBeGreaterThan(2);
  });

  it("verwirft ein langgestrecktes Gebilde wie einen Arm", () => {
    const arm = empty();
    fillRect(arm, 80, 60, 70, 6, PERSON);
    const results = framesOf([...lead(), arm]);

    expect(results[results.length - 1].candidates).toHaveLength(0);
  });

  it("erzeugt keinen Kandidaten, wenn eine Person durch das Bild läuft", () => {
    const walk = Array.from({ length: 20 }, (_, i) => {
      const frame = empty();
      fillRect(frame, -10 + i * 13, 55, 30, 110, PERSON);
      return frame;
    });
    const results = framesOf([...lead(), ...walk]);

    expect(candidateCount(results)).toBe(0);
    // Eine Person ist auffällig, aber nicht das ganze Bild.
    expect(results.some((result) => result.changedShare > 0.02)).toBe(true);
    expect(results.every((result) => result.sceneChanged === false)).toBe(true);
  });

  it("meldet bei sprunghafter Helligkeitsänderung keine Kandidatenflut", () => {
    const frames = [
      ...lead(10),
      ...lead(20, BRIGHT),
      ...Array.from({ length: 5 }, (_, i) => withBall(60 + i * 30, 90, BRIGHT)),
    ];
    const results = framesOf(frames);

    // Der Sprung selbst: ganzes Bild verändert, kein einziger Kandidat.
    expect(results[10].sceneChanged).toBe(true);
    expect(results[10].changedShare).toBeGreaterThan(0.9);
    expect(candidateCount(results.slice(10, 30))).toBe(0);

    // Danach ist der Hintergrund neu gelernt und die Aufnahme wieder auswertbar.
    expect(results.slice(18, 24).every((result) => result.learning)).toBe(true);
    for (let i = 30; i < results.length; i++) {
      expect(results[i].candidates, `Bild ${i} ohne Kandidaten`).toHaveLength(1);
    }
  });

  it("führt wanderndes Tageslicht nach, ohne Kandidaten zu erzeugen", () => {
    // Langsam heller werdender Raum: rund 0,3 Helligkeitsstufen je Bild.
    const frames = Array.from({ length: 120 }, (_, i) =>
      empty([BACKGROUND[0] + i * 0.3, BACKGROUND[1] + i * 0.3, BACKGROUND[2] + i * 0.3]),
    );
    const results = framesOf(frames);

    expect(candidateCount(results)).toBe(0);
    expect(results.every((result) => result.sceneChanged === false)).toBe(true);
  });

  it("lässt einen liegenden Ball nicht in den Hintergrund einsickern", () => {
    const resting = Array.from({ length: 60 }, () => withBall(120, 90));
    const results = framesOf([...lead(), ...resting]);

    expect(results[results.length - 1].candidates).toHaveLength(1);
  });

  it("meldet mehrere Kandidaten je Bild", () => {
    const frame = empty();
    fillDisc(frame, 60, 60, BALL_RADIUS, BALL);
    fillDisc(frame, 180, 120, BALL_RADIUS, BALL);
    const results = framesOf([...lead(), frame]);

    expect(results[results.length - 1].candidates).toHaveLength(2);
  });

  it("hält einen zu kleinen Fleck für Rauschen", () => {
    const speck = empty();
    fillDisc(speck, 120, 90, 2, BALL);
    const results = framesOf([...lead(), speck]);

    expect(results[results.length - 1].candidates).toHaveLength(0);
  });

  it("gibt für eine leere Bilderfolge ein leeres Ergebnis zurück", () => {
    expect(analyzeFlight([], settings)).toEqual({ frames: [], throws: [], scale: null });
  });
});

/** Eine Stelle im Bild. */
interface Spot {
  x: number;
  y: number;
}

/** Nur die erkannten Würfe — darum geht es in diesem Teil. */
function throwsOf(frames: readonly FlightFrame[]) {
  return analyzeFlight(frames, settings).throws;
}

/**
 * Eine Flugbahn als Punktfolge: gleichmäßig zur Seite, Parabel nach oben.
 * `base` ist die Höhe von Abwurf und Aufkommen, `peak` der Scheitel darüber.
 */
function arc(from: number, to: number, count: number, base = 140, peak = 70): Spot[] {
  return Array.from({ length: count }, (_, i) => {
    const u = i / (count - 1);
    return { x: from + (to - from) * u, y: base - 4 * peak * u * (1 - u) };
  });
}

/** Dieselbe Bahn, aber in den genannten Bildern ist der Ball nicht zu sehen. */
function hide(points: readonly Spot[], ...frames: number[]): (Spot | null)[] {
  return points.map((point, i) => (frames.includes(i) ? null : point));
}

/** Zeichnet einen oder mehrere Bälle in eine Folge sonst leerer Bilder. */
function sequence(
  length: number,
  balls: readonly { at: number; points: readonly (Spot | null)[] }[],
): FlightFrame[] {
  const frames = Array.from({ length }, () => empty());
  for (const ball of balls) {
    ball.points.forEach((point, i) => {
      if (point) fillDisc(frames[ball.at + i], point.x, point.y, BALL_RADIUS, BALL);
    });
  }
  return frames;
}

/** Eine einzelne Flugbahn nach dem leeren Vorlauf. */
function single(points: readonly (Spot | null)[]): FlightFrame[] {
  return [...lead(), ...sequence(points.length, [{ at: 0, points }])];
}

describe("analyzeFlight: Würfe aus Flugbahnen", () => {
  it("macht aus einem Flugbogen genau einen Wurf mit Zeitpunkt, Seite und Kennzahlen", () => {
    const throws = throwsOf(single(arc(20, 220, 12)));

    expect(throws).toHaveLength(1);
    const [first] = throws;
    expect(first.nr).toBe(1);
    expect(first.side).toBe("links");
    // Der Bogen beginnt im ersten Bild nach dem Vorlauf und dauert elf Bilder.
    expect(first.startFrame).toBe(LEARN_FRAMES + 2);
    expect(first.startedAt).toBeCloseTo((LEARN_FRAMES + 2) / 30, 6);
    expect(first.endedAt - first.startedAt).toBeCloseTo(11 / 30, 6);
    expect(first.points).toHaveLength(12);
    expect(first.points.map((point) => point.index)).toEqual(
      Array.from({ length: 12 }, (_, i) => LEARN_FRAMES + 2 + i),
    );

    // Kennzahlen in Bildpunkten: Scheitel rund 70 über dem Abwurf, gut 200
    // Bildpunkte in reichlich einer Drittelsekunde.
    expect(first.metrics.peakHeight).toBeGreaterThan(60);
    expect(first.metrics.peakHeight).toBeLessThan(80);
    expect(first.metrics.span).toBeGreaterThan(190);
    expect(first.metrics.span).toBeLessThan(210);
    expect(first.metrics.distance).toBeGreaterThan(first.metrics.span);
    expect(first.metrics.speedX).toBeCloseTo(first.metrics.span / first.metrics.duration, 3);
    expect(first.metrics.speed).toBeGreaterThan(first.metrics.speedX);
  });

  it("liest die Seite des Werfers aus der Flugrichtung — in beide Richtungen", () => {
    expect(throwsOf(single(arc(20, 220, 12))).map((found) => found.side)).toEqual(["links"]);
    expect(throwsOf(single(arc(220, 20, 12))).map((found) => found.side)).toEqual(["rechts"]);
  });

  it("zählt zwei Würfe kurz nacheinander einzeln", () => {
    // Vier Bilder Pause dazwischen: mehr, als eine Bahn überbrücken darf.
    const frames = [
      ...lead(),
      ...sequence(28, [
        { at: 0, points: arc(20, 220, 12) },
        { at: 16, points: arc(220, 20, 12) },
      ]),
    ];
    const throws = throwsOf(frames);

    expect(throws).toHaveLength(2);
    expect(throws.map((found) => found.nr)).toEqual([1, 2]);
    expect(throws.map((found) => found.side)).toEqual(["links", "rechts"]);
    expect(throws[1].startedAt).toBeGreaterThan(throws[0].endedAt);
  });

  it("hält zwei gleichzeitig fliegende Bälle auseinander", () => {
    // Beide sind in der Luft, aber in verschiedenen Höhen: Nur einer von beiden
    // setzt die bisherige Bewegung fort.
    const frames = [
      ...lead(),
      ...sequence(15, [
        { at: 0, points: arc(20, 220, 12, 160, 50) },
        { at: 3, points: arc(220, 20, 12, 60, 30) },
      ]),
    ];
    const throws = throwsOf(frames);

    expect(throws).toHaveLength(2);
    expect(throws.map((found) => found.side)).toEqual(["links", "rechts"]);
    expect(throws.every((found) => found.points.length === 12)).toBe(true);
  });

  it("überbrückt zwei Bilder, in denen der Ball nicht zu sehen ist", () => {
    // Der Ball ist kurz aus dem Bild geflogen oder hinter einem Becher
    // verschwunden. Danach geht die Bahn dort weiter, wo die Vorhersage sie
    // erwartet — es bleibt ein einziger Wurf.
    const throws = throwsOf(single(hide(arc(20, 220, 12), 5, 6)));

    expect(throws).toHaveLength(1);
    expect(throws[0].points).toHaveLength(10);
    expect(throws[0].endFrame - throws[0].startFrame).toBe(11);
    expect(throws[0].side).toBe("links");
  });

  it("reißt die Lücke weiter auf, bleibt kein Wurf übrig", () => {
    // Drei Bilder ohne Ball: Die Bahn endet, und keine der beiden Hälften ist
    // für sich genommen ein Wurf.
    expect(throwsOf(single(hide(arc(20, 220, 12), 5, 6, 7)))).toEqual([]);
  });

  it("zählt einen zurückrollenden Ball nicht als Wurf", () => {
    // Langsam über den Tisch zurück: 200 Bildpunkte in reichlich einer
    // Sekunde. Gefunden wird er sehr wohl — er besteht nur die Prüfung nicht.
    const points = Array.from({ length: 40 }, (_, i) => ({ x: 220 - (i * 200) / 39, y: 150 }));
    const frames = single(points);

    expect(candidateCount(analyzeFlight(frames, settings).frames)).toBeGreaterThan(30);
    expect(throwsOf(frames)).toEqual([]);
  });

  it("zählt einen Ball, der abprallt und zurückläuft, nicht als Wurf", () => {
    const back = [20, 52, 82, 110, 136, 160, 180, 194, 200, 188, 172, 152].map((x) => ({
      x,
      y: 150,
    }));

    expect(throwsOf(single(back))).toEqual([]);
  });

  it("meldet keinen Wurf, wenn gar nichts im Bild passiert", () => {
    expect(throwsOf(lead(40))).toEqual([]);
  });

  it("meldet keinen Wurf, wenn nur eine Person durch das Bild läuft", () => {
    const walk = Array.from({ length: 20 }, (_, i) => {
      const frame = empty();
      fillRect(frame, -10 + i * 13, 55, 30, 110, PERSON);
      return frame;
    });

    expect(throwsOf([...lead(), ...walk])).toEqual([]);
  });

  it("zählt einen liegen bleibenden Ball nicht als Wurf", () => {
    const resting = Array.from({ length: 40 }, () => ({ x: 120, y: 150 }));

    expect(throwsOf(single(resting))).toEqual([]);
  });
});

/**
 * Eine Bahn mit Aufprall auf der Tischebene: erster Bogen herunter, zweiter
 * Bogen weiter.
 *
 * `impact` ist der Punktindex des Aufpralls und darf gebrochen sein: 8 heißt
 * „genau auf Bild 8", 8.5 heißt „genau zwischen Bild 8 und Bild 9" — der Fall,
 * der bei 30 Bildern pro Sekunde der Normalfall ist.
 */
function bounceArc(
  from: number,
  to: number,
  count: number,
  impact: number,
  base = 150,
  rise = 60,
  rebound = 25,
): Spot[] {
  const last = count - 1;
  return Array.from({ length: count }, (_, i) => {
    const x = from + ((to - from) * i) / last;
    if (i <= impact) {
      const u = i / impact;
      return { x, y: base - 4 * rise * u * (1 - u) };
    }
    const w = (i - impact) / (last - impact);
    return { x, y: base - 4 * rebound * w * (1 - w) };
  });
}

describe("analyzeFlight: Aufsetzer durch den ganzen Kern", () => {
  it("ordnet einen gezeichneten Flugbogen als direkten Wurf ein", () => {
    const throws = throwsOf(single(arc(20, 220, 14)));

    expect(throws).toHaveLength(1);
    expect(throws[0].bounce).toBe(false);
    expect(throws[0].bouncePoint).toBeNull();
  });

  it("erkennt einen gezeichneten Aufsetzer und bleibt dabei ein einziger Wurf", () => {
    // Aufprall genau auf Bild 8: Dort kehrt sich die senkrechte Geschwindigkeit
    // vollständig um. Ohne die gespiegelte Vorhersage beim Verketten würde die
    // Bahn hier reißen und aus dem Aufsetzer würden zwei zu kurze Bruchstücke.
    const throws = throwsOf(single(bounceArc(20, 220, 16, 8)));

    expect(throws).toHaveLength(1);
    const [found] = throws;
    expect(found.points).toHaveLength(16);
    expect(found.bounce).toBe(true);

    const bounce = found.bouncePoint;
    expect(bounce).not.toBeNull();
    if (!bounce) return;
    // Aufgekommen auf gut der Hälfte der Strecke, nahe der Tischebene bei y 150.
    expect(bounce.x).toBeGreaterThan(110);
    expect(bounce.x).toBeLessThan(150);
    expect(bounce.y).toBeGreaterThan(135);
    expect(bounce.at).toBeGreaterThan(found.startedAt);
    expect(bounce.at).toBeLessThan(found.endedAt);
    expect(bounce.rise).toBeGreaterThan(10);
  });

  it("schätzt einen Aufprall zwischen zwei Bildern auch aus gezeichneten Bällen", () => {
    const throws = throwsOf(single(bounceArc(20, 220, 16, 8.5)));

    expect(throws).toHaveLength(1);
    const bounce = throws[0].bouncePoint;
    expect(bounce).not.toBeNull();
    if (!bounce) return;

    // Der geschätzte Zeitpunkt liegt zwischen den beiden Bildern, nicht auf
    // einem von beiden.
    expect(bounce.frameAfter).toBe(bounce.frameBefore + 1);
    expect(bounce.at).toBeGreaterThan(bounce.frameBefore / 30);
    expect(bounce.at).toBeLessThan(bounce.frameAfter / 30);
  });

  it("ordnet denselben Aufsetzer mit und ohne Kalibrierung gleich ein", () => {
    const frames = single(bounceArc(20, 220, 16, 8));
    const ohne = analyzeFlight(frames, settings);
    const mit = analyzeFlight(frames, calibrated);

    // Die Liste der Würfe ist in beiden Fällen dieselbe.
    expect(ohne.throws).toHaveLength(mit.throws.length);
    expect(ohne.throws[0].bounce).toBe(true);
    expect(mit.throws[0].bounce).toBe(true);
    // Nur der Abstand zur Tischebene fehlt ohne Kalibrierung.
    expect(ohne.throws[0].bouncePoint?.tableGap).toBeNull();
    expect(mit.throws[0].bouncePoint?.tableGap).not.toBeNull();
  });

  it("macht aus einem zurückrollenden Ball auch keinen Aufsetzer", () => {
    // Er ist schon kein Wurf — und damit gibt es auch nichts einzuordnen.
    const points = Array.from({ length: 40 }, (_, i) => ({ x: 220 - (i * 200) / 39, y: 150 }));

    expect(throwsOf(single(points))).toEqual([]);
  });
});

/**
 * Die Kalibrierung dieser Bildfolgen: eine vordere Tischkante von x 20 bis
 * x 220 — 200 Bildpunkte, die 240 cm bedeuten. Das sind genau 1,2 cm je
 * Bildpunkt, und damit lässt sich jeder erwartete Wert von Hand nachrechnen.
 */
const CALIBRATION: TableCalibration = {
  edgeStart: { x: 20, y: 170 },
  edgeEnd: { x: 220, y: 170 },
  tableLengthCm: 240,
};
const CM_PER_PIXEL = 240 / 200;

const calibrated: FlightSettings = { ...settings, calibration: CALIBRATION };

/**
 * Ein Flugbogen mit bekannter Höhe: 100 Bildpunkte über dem Abwurfpunkt. Beim
 * Maßstab dieser Aufstellung sind das 120 cm.
 */
function knownArc(): FlightFrame[] {
  return single(arc(20, 220, 12, 160, 100));
}

describe("analyzeFlight: echte Einheiten aus der Kalibrierung", () => {
  it("macht aus einer Bahn mit bekannter Höhe die erwartete Bogenhöhe in Zentimetern", () => {
    const analysis = analyzeFlight(knownArc(), calibrated);

    expect(analysis.throws).toHaveLength(1);
    const { metrics } = analysis.throws[0];

    // Gemessen wird der Scheitel über dem ersten gesehenen Punkt; das sind bei
    // dieser Bahn rund 100 Bildpunkte.
    expect(metrics.peakHeight).toBeGreaterThan(90);
    expect(metrics.peakHeight).toBeLessThan(110);

    // Und in Zentimetern: rund 120, also die 100 Bildpunkte mal 1,2.
    expect(metrics.peakHeightCm).toBeGreaterThan(108);
    expect(metrics.peakHeightCm).toBeLessThan(132);
    expect(metrics.peakHeightCm).toBeCloseTo(metrics.peakHeight * CM_PER_PIXEL, 6);
  });

  it("gibt Weite in Zentimetern und Tempo in Metern je Sekunde an", () => {
    const { throws } = analyzeFlight(knownArc(), calibrated);
    const { metrics } = throws[0];

    // 200 Bildpunkte Weite sind 240 cm — die ganze Tischlänge.
    expect(metrics.spanCm).toBeGreaterThan(228);
    expect(metrics.spanCm).toBeLessThan(252);
    expect(metrics.spanCm).toBeCloseTo(metrics.span * CM_PER_PIXEL, 6);
    expect(metrics.distanceCm).toBeCloseTo(metrics.distance * CM_PER_PIXEL, 6);

    // Die Bahn dauert 11/30 Sekunden; 240 cm in gut einer Drittelsekunde sind
    // rund 6,5 Meter je Sekunde waagerecht.
    expect(metrics.speedXMps).toBeGreaterThan(5);
    expect(metrics.speedXMps).toBeLessThan(8);
    expect(metrics.speedXMps).toBeCloseTo((metrics.speedX * CM_PER_PIXEL) / 100, 6);
    expect(metrics.speedMps).toBeGreaterThan(metrics.speedXMps ?? 0);
  });

  it("legt den benutzten Maßstab zum Ergebnis, damit er nachvollziehbar bleibt", () => {
    const { scale } = analyzeFlight(knownArc(), calibrated);

    expect(scale?.cmPerPixel).toBeCloseTo(CM_PER_PIXEL, 6);
    expect(scale?.edgeLength).toBeCloseTo(200, 6);
    expect(scale?.tableLengthCm).toBe(240);
  });

  it("erkennt ohne Kalibrierung dieselben Würfe, nur ohne Zentimeter", () => {
    const frames = knownArc();
    const ohne = analyzeFlight(frames, settings);
    const mit = analyzeFlight(frames, calibrated);

    expect(ohne.scale).toBeNull();
    expect(ohne.throws).toHaveLength(1);
    // Die Erkennung hängt nicht an der Kalibrierung: gleiche Zahl, gleiche
    // Seite, gleiche Bildpunkt-Werte.
    expect(ohne.throws.length).toBe(mit.throws.length);
    expect(ohne.throws[0].side).toBe(mit.throws[0].side);
    expect(ohne.throws[0].metrics.peakHeight).toBeCloseTo(mit.throws[0].metrics.peakHeight, 6);
    expect(ohne.throws[0].metrics.speed).toBeCloseTo(mit.throws[0].metrics.speed, 6);

    // Nur die echten Einheiten fehlen.
    expect(ohne.throws[0].metrics.peakHeightCm).toBeUndefined();
    expect(ohne.throws[0].metrics.spanCm).toBeUndefined();
    expect(ohne.throws[0].metrics.speedMps).toBeUndefined();
  });

  it("bleibt bei Bildpunkten, wenn die Kalibrierung unbrauchbar ist", () => {
    // Beide Punkte auf derselben Stelle: daraus entsteht kein Maßstab.
    const kaputt: FlightSettings = {
      ...settings,
      calibration: { ...CALIBRATION, edgeEnd: { x: 22, y: 170 } },
    };
    const analysis = analyzeFlight(knownArc(), kaputt);

    expect(analysis.scale).toBeNull();
    expect(analysis.throws).toHaveLength(1);
    expect(analysis.throws[0].metrics.peakHeightCm).toBeUndefined();
  });

  it("behält die Bildpunkt-Werte auch mit Kalibrierung", () => {
    const { throws } = analyzeFlight(knownArc(), calibrated);
    const { metrics } = throws[0];

    expect(metrics.peakHeight).toBeGreaterThan(0);
    expect(metrics.span).toBeGreaterThan(0);
    expect(metrics.speed).toBeGreaterThan(0);
    expect(metrics.distance).toBeGreaterThan(0);
  });
});
