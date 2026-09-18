import { describe, expect, it } from "vitest";
import { analyzeFlight } from "./detector.ts";
import { type Rgb, createFrame, fillDisc, fillRect } from "./frame.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { FlightFrame, FrameResult } from "./types.ts";

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

describe("analyzeFlight", () => {
  it("meldet je Bild ein Ergebnis mit Zeitpunkt aus den Bildern pro Sekunde", () => {
    const results = analyzeFlight(lead(6), settings);

    expect(results).toHaveLength(6);
    expect(results.map((result) => result.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(results[3].at).toBeCloseTo(3 / 30, 6);
  });

  it("lernt den Hintergrund aus dem leeren Vorlauf und meldet solange nichts", () => {
    const results = analyzeFlight(lead(10), settings);

    expect(results.slice(0, LEARN_FRAMES).every((result) => result.learning)).toBe(true);
    expect(results.slice(LEARN_FRAMES).every((result) => result.learning)).toBe(false);
    expect(candidateCount(results)).toBe(0);
    expect(results.every((result) => result.sceneChanged === false)).toBe(true);
  });

  it("findet den gezeichneten Ball als Kandidaten an seiner tatsächlichen Stelle", () => {
    const path = Array.from({ length: 8 }, (_, i) => ({ x: 30 + i * 22, y: 40 + i * 12 }));
    const frames = [...lead(), ...path.map((point) => withBall(point.x, point.y))];
    const results = analyzeFlight(frames, settings);

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
    const results = analyzeFlight([...lead(), streak], settings);

    const candidates = results[results.length - 1].candidates;
    expect(candidates).toHaveLength(1);
    expect(candidates[0].aspect).toBeGreaterThan(2);
  });

  it("verwirft ein langgestrecktes Gebilde wie einen Arm", () => {
    const arm = empty();
    fillRect(arm, 80, 60, 70, 6, PERSON);
    const results = analyzeFlight([...lead(), arm], settings);

    expect(results[results.length - 1].candidates).toHaveLength(0);
  });

  it("erzeugt keinen Kandidaten, wenn eine Person durch das Bild läuft", () => {
    const walk = Array.from({ length: 20 }, (_, i) => {
      const frame = empty();
      fillRect(frame, -10 + i * 13, 55, 30, 110, PERSON);
      return frame;
    });
    const results = analyzeFlight([...lead(), ...walk], settings);

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
    const results = analyzeFlight(frames, settings);

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
    const results = analyzeFlight(frames, settings);

    expect(candidateCount(results)).toBe(0);
    expect(results.every((result) => result.sceneChanged === false)).toBe(true);
  });

  it("lässt einen liegenden Ball nicht in den Hintergrund einsickern", () => {
    const resting = Array.from({ length: 60 }, () => withBall(120, 90));
    const results = analyzeFlight([...lead(), ...resting], settings);

    expect(results[results.length - 1].candidates).toHaveLength(1);
  });

  it("meldet mehrere Kandidaten je Bild", () => {
    const frame = empty();
    fillDisc(frame, 60, 60, BALL_RADIUS, BALL);
    fillDisc(frame, 180, 120, BALL_RADIUS, BALL);
    const results = analyzeFlight([...lead(), frame], settings);

    expect(results[results.length - 1].candidates).toHaveLength(2);
  });

  it("hält einen zu kleinen Fleck für Rauschen", () => {
    const speck = empty();
    fillDisc(speck, 120, 90, 2, BALL);
    const results = analyzeFlight([...lead(), speck], settings);

    expect(results[results.length - 1].candidates).toHaveLength(0);
  });

  it("gibt für eine leere Bilderfolge eine leere Liste zurück", () => {
    expect(analyzeFlight([], settings)).toEqual([]);
  });
});
