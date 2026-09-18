import { describe, expect, it } from "vitest";
import { analysisSize, frameCount, sampleTime } from "./video-frames.ts";

describe("frameCount", () => {
  it("zählt die Bilder einer Aufnahme aus Länge und Bildrate", () => {
    expect(frameCount(26, 30, 1800)).toBe(780);
  });

  it("schneidet bei der Obergrenze ab, statt eine Stunde Video durchzurechnen", () => {
    expect(frameCount(3600, 30, 1800)).toBe(1800);
  });

  it("zählt angefangene Bilder nicht mit — ein halbes Bild gibt es nicht", () => {
    expect(frameCount(1.99, 30, 1800)).toBe(59);
  });

  it("meldet 0 statt zu raten, wenn Länge oder Bildrate unbrauchbar sind", () => {
    // Bei manchen Dateien kennt der Browser die Länge nicht (`Infinity`).
    expect(frameCount(Number.POSITIVE_INFINITY, 30, 1800)).toBe(0);
    expect(frameCount(Number.NaN, 30, 1800)).toBe(0);
    expect(frameCount(26, 0, 1800)).toBe(0);
    expect(frameCount(-5, 30, 1800)).toBe(0);
  });
});

describe("sampleTime", () => {
  it("greift in der Mitte des Bildes ab, nicht auf seiner Kante", () => {
    // Bild 0 steht von 0 bis 1/30 s — abgegriffen wird bei 1/60 s.
    expect(sampleTime(0, 30)).toBeCloseTo(1 / 60, 9);
    expect(sampleTime(102, 30)).toBeCloseTo(102 / 30 + 1 / 60, 9);
  });

  it("bleibt innerhalb des Bildes, das es treffen soll", () => {
    for (const index of [0, 1, 29, 100, 779]) {
      expect(Math.floor(sampleTime(index, 30) * 30)).toBe(index);
    }
  });
});

describe("analysisSize", () => {
  it("verkleinert auf die Zielbreite und behält das Seitenverhältnis", () => {
    expect(analysisSize(1280, 720, 640)).toEqual({ width: 640, height: 360 });
    expect(analysisSize(1920, 1080, 640)).toEqual({ width: 640, height: 360 });
  });

  it("lässt eine Aufnahme in Zielgröße unverändert", () => {
    expect(analysisSize(640, 360, 640)).toEqual({ width: 640, height: 360 });
  });

  it("liefert gerade Kantenlängen, damit die Hälfte aufgeht", () => {
    const { width, height } = analysisSize(1080, 1921, 641);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it("gibt ein Quadrat zurück, solange die Größe der Datei unbekannt ist", () => {
    expect(analysisSize(0, 0, 640)).toEqual({ width: 640, height: 640 });
  });
});
