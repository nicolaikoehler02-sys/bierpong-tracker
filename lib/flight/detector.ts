import { Background } from "./background.ts";
import { findCandidates } from "./candidates.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import type { FlightFrame, FrameResult } from "./types.ts";

/**
 * Der Erkennungskern der Seitenkamera: Bilderfolge plus Einstellungen hinein,
 * ein Ergebnis je Bild heraus.
 *
 * Der Ablauf je Bild:
 *
 * 1. Das Bild mit dem gelernten Hintergrund vergleichen (siehe `Background`).
 *    Solange der Hintergrund noch gelernt wird, wird nichts gemeldet.
 * 2. Weicht fast das ganze Bild ab, ist es kein Wurf, sondern umgeschaltetes
 *    Licht oder eine bewegte Kamera. Hält das an, wird der Hintergrund neu
 *    gelernt, damit die Aufnahme danach weiter auswertbar ist.
 * 3. Sonst: Hintergrund nachführen und alle Ball-Kandidaten einsammeln
 *    (siehe `findCandidates`).
 *
 * Mehrere Kandidaten je Bild sind ausdrücklich erlaubt. Welcher davon zu
 * welchem Wurf gehört, entscheidet erst das Verketten zu Flugbahnen im
 * nächsten Schritt.
 */
export function analyzeFlight(
  frames: readonly FlightFrame[],
  settings: FlightSettings = defaultFlightSettings,
): FrameResult[] {
  if (frames.length === 0) return [];

  const { width, height } = frames[0];
  const background = new Background(width, height, settings);
  const grid = {
    gridWidth: background.gridWidth,
    gridHeight: background.gridHeight,
    step: background.step,
    imageWidth: width,
    imageHeight: height,
  };
  const stack = new Int32Array(background.cells);

  const results: FrameResult[] = [];
  let sceneFrames = 0;

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const at = settings.fps > 0 ? index / settings.fps : index;
    const reading = background.read(frame);

    if (!reading.learning && reading.changedShare > settings.maxChangedShare) {
      sceneFrames++;
      // Hält die Störung an, ist der gelernte Hintergrund überholt. Statt den
      // Rest der Aufnahme aufzugeben, wird er neu gelernt.
      if (sceneFrames >= settings.relearnFrames) {
        background.reset();
        sceneFrames = 0;
      }
      results.push({
        index,
        at,
        candidates: [],
        changedShare: reading.changedShare,
        sceneChanged: true,
        learning: false,
      });
      continue;
    }
    sceneFrames = 0;

    if (reading.learning) {
      background.absorb();
      results.push({
        index,
        at,
        candidates: [],
        changedShare: reading.changedShare,
        sceneChanged: false,
        learning: true,
      });
      continue;
    }

    // Erst nachführen, dann suchen: Die Suche verbraucht die Maske.
    background.follow();
    const candidates = findCandidates(background.mask, stack, grid, settings);
    results.push({
      index,
      at,
      candidates,
      changedShare: reading.changedShare,
      sceneChanged: false,
      learning: false,
    });
  }

  return results;
}
