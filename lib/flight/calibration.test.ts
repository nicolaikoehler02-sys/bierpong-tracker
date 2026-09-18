import { describe, expect, it } from "vitest";
import {
  TOURNAMENT_TABLE_LENGTH_CM,
  pixelsPerSecondToMetersPerSecond,
  pixelsToCm,
  tableYAt,
  toScale,
  toTableLine,
} from "./calibration.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { TableCalibration } from "./types.ts";

const settings: FlightSettings = defaultFlightSettings;

/** Eine Tischkante über 600 Bildpunkte, 240 cm lang — also 0,4 cm je Bildpunkt. */
const calibration: TableCalibration = {
  edgeStart: { x: 20, y: 300 },
  edgeEnd: { x: 620, y: 300 },
  tableLengthCm: TOURNAMENT_TABLE_LENGTH_CM,
};

describe("toScale: aus der Kalibrierung wird ein Maßstab", () => {
  it("rechnet die markierte Tischkante in Zentimeter je Bildpunkt um", () => {
    const scale = toScale(calibration, 640, settings);

    expect(scale).not.toBeNull();
    expect(scale?.edgeLength).toBeCloseTo(600, 6);
    expect(scale?.cmPerPixel).toBeCloseTo(0.4, 6);
    expect(scale?.tableLengthCm).toBe(240);
    expect(scale?.imageFactor).toBe(1);
  });

  it("misst auch eine schräg markierte Kante über ihre wahre Länge", () => {
    // 300 waagerecht, 400 senkrecht — die Strecke ist 500 Bildpunkte lang.
    const schraeg: TableCalibration = {
      edgeStart: { x: 0, y: 0 },
      edgeEnd: { x: 300, y: 400 },
      tableLengthCm: 250,
    };

    expect(toScale(schraeg, 640, settings)?.edgeLength).toBeCloseTo(500, 6);
    expect(toScale(schraeg, 640, settings)?.cmPerPixel).toBeCloseTo(0.5, 6);
  });

  it("nimmt die Tischlänge, wie sie angegeben ist — unser Tisch ist kein Turniertisch", () => {
    const kurz: TableCalibration = { ...calibration, tableLengthCm: 180 };

    expect(toScale(kurz, 640, settings)?.cmPerPixel).toBeCloseTo(0.3, 6);
  });

  it("rechnet Punkte, die in voller Auflösung markiert wurden, auf das ausgewertete Bild um", () => {
    // Markiert bei 1280 Bildpunkten Breite, ausgewertet bei 640: Die Kante ist
    // im ausgewerteten Bild halb so lang, der Maßstab doppelt so grob.
    const voll: TableCalibration = { ...calibration, referenceWidth: 1280 };
    const scale = toScale(voll, 640, settings);

    expect(scale?.imageFactor).toBeCloseTo(0.5, 6);
    expect(scale?.edgeLength).toBeCloseTo(300, 6);
    expect(scale?.cmPerPixel).toBeCloseTo(0.8, 6);
  });

  it("meldet ohne Kalibrierung keinen Maßstab", () => {
    expect(toScale(null, 640, settings)).toBeNull();
    expect(toScale(undefined, 640, settings)).toBeNull();
  });

  it("verwirft eine unsinnige Kalibrierung, statt falsche Zentimeter zu liefern", () => {
    // Zwei Punkte fast aufeinander: ein Bildpunkt Ungenauigkeit würde den
    // Maßstab vervielfachen.
    expect(
      toScale({ ...calibration, edgeEnd: { x: 24, y: 300 } }, 640, settings),
    ).toBeNull();
    expect(toScale({ ...calibration, tableLengthCm: 0 }, 640, settings)).toBeNull();
    expect(toScale({ ...calibration, tableLengthCm: -240 }, 640, settings)).toBeNull();
  });
});

describe("toTableLine: aus derselben Kalibrierung wird die Tischebene", () => {
  it("gibt die markierte Kante als Strecke im ausgewerteten Bild zurück", () => {
    const line = toTableLine(calibration, 640, settings);

    expect(line).toEqual({ startX: 20, startY: 300, endX: 620, endY: 300 });
  });

  it("rechnet sie wie den Maßstab auf die ausgewertete Bildgröße um", () => {
    const line = toTableLine({ ...calibration, referenceWidth: 1280 }, 640, settings);

    expect(line).toEqual({ startX: 10, startY: 150, endX: 310, endY: 150 });
  });

  it("meldet ohne brauchbare Kalibrierung keine Tischebene", () => {
    expect(toTableLine(null, 640, settings)).toBeNull();
    expect(toTableLine(undefined, 640, settings)).toBeNull();
    // Zwei Punkte fast aufeinander: daraus wird auch keine Ebene.
    expect(toTableLine({ ...calibration, edgeEnd: { x: 24, y: 300 } }, 640, settings)).toBeNull();
  });

  it("liest die Höhe des Tisches an jeder Stelle ab, auch bei schräger Kante", () => {
    // Die Kamera schaut selten genau senkrecht auf die Kante: links y 300,
    // rechts y 340.
    const schraeg = toTableLine(
      { ...calibration, edgeEnd: { x: 620, y: 340 } },
      640,
      settings,
    );
    if (!schraeg) throw new Error("Die Kalibrierung des Tests muss eine Tischebene ergeben.");

    expect(tableYAt(schraeg, 20)).toBeCloseTo(300, 6);
    expect(tableYAt(schraeg, 320)).toBeCloseTo(320, 6);
    expect(tableYAt(schraeg, 620)).toBeCloseTo(340, 6);
    // Außerhalb der markierten Punkte wird die Gerade verlängert.
    expect(tableYAt(schraeg, 0)).toBeCloseTo(298.667, 3);
  });
});

describe("Umrechnung: bekannter Maßstab hinein, erwarteter Wert heraus", () => {
  const scale = toScale(calibration, 640, settings);
  if (!scale) throw new Error("Die Kalibrierung des Tests muss einen Maßstab ergeben.");

  it("rechnet Bildpunkte in Zentimeter", () => {
    // 0,4 cm je Bildpunkt: 250 Bildpunkte Scheitelhöhe sind 100 cm.
    expect(pixelsToCm(250, scale)).toBeCloseTo(100, 6);
    expect(pixelsToCm(0, scale)).toBe(0);
  });

  it("rechnet Bildpunkte je Sekunde in Meter je Sekunde", () => {
    // 0,4 cm je Bildpunkt: 750 Bildpunkte je Sekunde sind 3 m/s.
    expect(pixelsPerSecondToMetersPerSecond(750, scale)).toBeCloseTo(3, 6);
    expect(pixelsPerSecondToMetersPerSecond(0, scale)).toBe(0);
  });
});
