import { Background } from "./background.ts";
import { toScale, toTableLine } from "./calibration.ts";
import { type CandidateGrid, findCandidates } from "./candidates.ts";
import { type FlightSettings, defaultFlightSettings } from "./settings.ts";
import { buildTracks } from "./tracks.ts";
import { toThrows } from "./throws.ts";
import type { FlightAnalysis, FlightFrame, FlightScale, FrameResult, TableLine } from "./types.ts";

/** Alles, was erst feststeht, wenn die Bildgröße bekannt ist — also ab dem ersten Bild. */
interface Prepared {
  background: Background;
  grid: CandidateGrid;
  /** Arbeitsspeicher der Fleckensuche, einmal angelegt und je Bild wiederverwendet */
  stack: Int32Array;
  scale: FlightScale | null;
  tableLine: TableLine | null;
}

/**
 * Derselbe Erkennungskern, nur Bild für Bild gefüttert statt mit der ganzen
 * Bilderfolge auf einmal.
 *
 * `analyzeFlight` bekommt alle Bilder als Feld und ist damit für das
 * Auswertungsskript genau richtig: ffmpeg zerlegt die Aufnahme, der Speicher
 * gehört dem Skript allein. Im Browser geht das nicht — eine halbe Minute bei
 * 640×360 sind rund 780 Bilder zu je 900 kB, also über ein halbes Gigabyte
 * allein an Rohbildern, und das Bild kommt ohnehin einzeln aus dem Video auf das
 * Canvas.
 *
 * Deshalb liegt der Ablauf hier: `push` nimmt ein Bild entgegen und gibt sein
 * Ergebnis zurück, `finish` verkettet am Ende die Kandidaten zu Flugbahnen und
 * daraus zu Würfen. Wer sein Bild danach wegwirft, verliert nichts — der Kern
 * merkt sich, was er braucht.
 *
 * **`analyzeFlight` ist nichts anderes als dieser Ablauf in einer Schleife.**
 * Beide Wege rechnen damit nicht nur gleich, sondern buchstäblich dasselbe; es
 * gibt keine zweite Umsetzung, die auseinanderlaufen könnte.
 */
export class FlightRun {
  readonly settings: FlightSettings;

  private prepared: Prepared | null = null;
  private readonly results: FrameResult[] = [];
  /** Bilder am Stück, in denen sich das ganze Bild verändert hat */
  private sceneFrames = 0;

  constructor(settings: FlightSettings = defaultFlightSettings) {
    this.settings = settings;
  }

  /** So viele Bilder sind bisher ausgewertet. */
  get frameCount(): number {
    return this.results.length;
  }

  /**
   * Wertet das nächste Bild der Aufnahme aus und gibt sein Ergebnis zurück.
   *
   * Die Bildnummer ergibt sich aus der Reihenfolge der Aufrufe, der Zeitpunkt
   * aus den Bildern pro Sekunde. Die Bilder müssen deshalb lückenlos und in der
   * richtigen Reihenfolge kommen; ein übersprungenes Bild verschiebt alles
   * danach.
   *
   * Das übergebene Bild wird nicht verändert und nicht behalten.
   */
  push(frame: FlightFrame): FrameResult {
    const settings = this.settings;
    const prepared = (this.prepared ??= prepare(frame, settings));
    const index = this.results.length;
    const at = settings.fps > 0 ? index / settings.fps : index;
    const reading = prepared.background.read(frame);

    if (!reading.learning && reading.changedShare > settings.maxChangedShare) {
      this.sceneFrames++;
      // Hält die Störung an, ist der gelernte Hintergrund überholt. Statt den
      // Rest der Aufnahme aufzugeben, wird er neu gelernt.
      if (this.sceneFrames >= settings.relearnFrames) {
        prepared.background.reset();
        this.sceneFrames = 0;
      }
      return this.record({
        index,
        at,
        candidates: [],
        changedShare: reading.changedShare,
        sceneChanged: true,
        learning: false,
      });
    }
    this.sceneFrames = 0;

    if (reading.learning) {
      prepared.background.absorb();
      return this.record({
        index,
        at,
        candidates: [],
        changedShare: reading.changedShare,
        sceneChanged: false,
        learning: true,
      });
    }

    // Erst nachführen, dann suchen: Die Suche verbraucht die Maske.
    prepared.background.follow();
    return this.record({
      index,
      at,
      candidates: findCandidates(prepared.background.mask, prepared.stack, prepared.grid, settings),
      changedShare: reading.changedShare,
      sceneChanged: false,
      learning: false,
    });
  }

  /**
   * Schließt die Aufnahme ab: Aus den gesammelten Kandidaten werden Flugbahnen
   * und daraus die Würfe.
   *
   * Ohne ein einziges Bild gibt es nichts zu verketten und keinen Maßstab —
   * dann kommt das leere Ergebnis heraus.
   */
  finish(): FlightAnalysis {
    const prepared = this.prepared;
    if (!prepared) return { frames: [], throws: [], scale: null };
    return {
      frames: this.results,
      throws: toThrows(
        buildTracks(this.results, this.settings),
        this.settings,
        prepared.scale,
        prepared.tableLine,
      ),
      scale: prepared.scale,
    };
  }

  private record(result: FrameResult): FrameResult {
    this.results.push(result);
    return result;
  }
}

/** Hintergrund, Suchraster und Kalibrierung für die Bildgröße des ersten Bildes. */
function prepare(frame: FlightFrame, settings: FlightSettings): Prepared {
  const { width, height } = frame;
  const background = new Background(width, height, settings);
  return {
    background,
    grid: {
      gridWidth: background.gridWidth,
      gridHeight: background.gridHeight,
      step: background.step,
      imageWidth: width,
      imageHeight: height,
    },
    stack: new Int32Array(background.cells),
    scale: toScale(settings.calibration, width, settings),
    // Dieselbe Kalibrierung, andere Frage: nicht „wie groß", sondern „wo liegt
    // der Tisch". Ohne Kalibrierung bleibt sie unbeantwortet, und die
    // Aufsetzer-Erkennung arbeitet allein über die Form der Bahn.
    tableLine: toTableLine(settings.calibration, width, settings),
  };
}
