import { describe, expect, it } from "vitest";
import { analyzeFlight } from "./detector.ts";
import { type Rgb, createFrame, fillDisc } from "./frame.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { FlightFrame } from "./types.ts";

const WIDTH = 160;
const HEIGHT = 120;
const BACKGROUND: Rgb = [24, 18, 12];
const BALL: Rgb = [250, 250, 250];

const settings: FlightSettings = { ...defaultFlightSettings, fps: 30 };

/** Erzeugt eine künstliche Bilderfolge: ein heller Punkt auf einer vorgegebenen Bahn. */
function sequence(path: Array<{ x: number; y: number }>, radius = 5): FlightFrame[] {
  return path.map((point) => {
    const frame = createFrame(WIDTH, HEIGHT, BACKGROUND);
    fillDisc(frame, point.x, point.y, radius, BALL);
    return frame;
  });
}

describe("analyzeFlight", () => {
  it("meldet je Bild ein Ergebnis mit Zeitpunkt aus den Bildern pro Sekunde", () => {
    const frames = sequence(Array.from({ length: 6 }, (_, i) => ({ x: 20 + i * 12, y: 60 })));
    const results = analyzeFlight(frames, settings);

    expect(results).toHaveLength(6);
    expect(results.map((result) => result.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(results[3].at).toBeCloseTo(3 / 30, 6);
  });

  it("findet den bewegten hellen Punkt und folgt ihm über die Bilder", () => {
    const path = Array.from({ length: 8 }, (_, i) => ({ x: 20 + i * 14, y: 40 + i * 6 }));
    const results = analyzeFlight(sequence(path), settings);

    // Das erste Bild hat kein Vorbild — dort darf nichts gemeldet werden.
    expect(results[0].change).toBeNull();

    for (let i = 1; i < results.length; i++) {
      const change = results[i].change;
      expect(change, `Bild ${i} ohne Veränderung`).not.toBeNull();
      // Die Veränderung liegt zwischen der alten und der neuen Punktposition.
      const from = path[i - 1];
      const to = path[i];
      expect(change!.x).toBeGreaterThan(Math.min(from.x, to.x) - 10);
      expect(change!.x).toBeLessThan(Math.max(from.x, to.x) + 10);
      expect(change!.y).toBeGreaterThan(Math.min(from.y, to.y) - 10);
      expect(change!.y).toBeLessThan(Math.max(from.y, to.y) + 10);
      expect(results[i].sceneChanged).toBe(false);
    }

    // Der Punkt wandert nach rechts unten, die Meldungen wandern mit.
    const first = results[1].change!;
    const last = results[results.length - 1].change!;
    expect(last.x).toBeGreaterThan(first.x + 40);
    expect(last.y).toBeGreaterThan(first.y + 20);
  });

  it("meldet nichts, wenn sich in der Aufnahme nichts bewegt", () => {
    const frames = sequence(Array.from({ length: 5 }, () => ({ x: 80, y: 60 })));
    const results = analyzeFlight(frames, settings);

    expect(results.every((result) => result.change === null)).toBe(true);
    expect(results.every((result) => result.sceneChanged === false)).toBe(true);
  });

  it("hält einen zu kleinen Fleck für Rauschen", () => {
    const path = [
      { x: 40, y: 60 },
      { x: 120, y: 60 },
    ];
    const normal = analyzeFlight(sequence(path), settings);
    // Ein Punkt von unter einem Pixel liegt weit unter der Mindestgröße.
    const tiny = analyzeFlight(sequence(path, 0.7), settings);

    expect(normal[1].change).not.toBeNull();
    expect(tiny[1].change).toBeNull();
  });

  it("meldet bei sprunghafter Lichtänderung nichts, sondern einen Szenenwechsel", () => {
    const dunkel = createFrame(WIDTH, HEIGHT, [20, 20, 20]);
    const hell = createFrame(WIDTH, HEIGHT, [200, 200, 200]);
    const results = analyzeFlight([dunkel, hell], settings);

    expect(results[1].sceneChanged).toBe(true);
    expect(results[1].change).toBeNull();
    expect(results[1].changedShare).toBeGreaterThan(0.9);
  });

  it("gibt für eine leere Bilderfolge eine leere Liste zurück", () => {
    expect(analyzeFlight([], settings)).toEqual([]);
  });
});
