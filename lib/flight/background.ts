import type { FlightSettings } from "./settings.ts";
import type { FlightFrame } from "./types.ts";

/** Die Zelle sieht aus wie der gelernte Hintergrund. */
export const CELL_BACKGROUND = 0;
/** Die Zelle weicht vom gelernten Hintergrund ab. */
export const CELL_FOREGROUND = 1;

/** Ergebnis des Vergleichs eines Bildes mit dem gelernten Hintergrund. */
export interface BackgroundReading {
  /** Anteil der Zellen, die vom Hintergrund abweichen (0–1) */
  changedShare: number;
  /** Der Hintergrund ist noch nicht fertig gelernt */
  learning: boolean;
  /** Faktor, mit dem das Bild auf die Helligkeit des Hintergrunds gerechnet wurde */
  gain: number;
}

/**
 * Der gelernte Hintergrund der Seitenkamera: Tisch, Wand, Becher — alles, was
 * sich nicht bewegt.
 *
 * Gelernt wird aus den ersten Sekunden der Aufnahme, in denen niemand im Bild
 * ist; danach wird langsam nachgeführt, damit wanderndes Tageslicht nicht als
 * Veränderung durchschlägt. Nachgeführt werden dabei **nur Zellen ohne
 * Abweichung** — dadurch kann ein fliegender Ball nie in den Hintergrund
 * einsickern, egal wie lange er im Bild ist.
 *
 * Kurzfristige Sprünge der Belichtungsautomatik fängt zusätzlich ein
 * Helligkeitsausgleich ab, wie ihn die Deckenkamera schon benutzt: Das
 * aktuelle Bild wird auf die mittlere Helligkeit des Hintergrunds gerechnet,
 * bevor verglichen wird.
 *
 * Gearbeitet wird auf einem groben Raster: je Rasterzelle ein geprüfter
 * Bildpunkt (siehe `sampleStep`).
 */
export class Background {
  /** Rasterbreite in Zellen */
  readonly gridWidth: number;
  /** Rasterhöhe in Zellen */
  readonly gridHeight: number;
  /** Kantenlänge einer Rasterzelle in Bildpunkten */
  readonly step: number;
  readonly cells: number;
  /** Je Zelle `CELL_BACKGROUND` oder `CELL_FOREGROUND` — gefüllt von `read` */
  readonly mask: Uint8Array;

  /** Gelernte Helligkeit je Rasterzelle */
  private readonly learned: Float32Array;
  /** Helligkeit des zuletzt gelesenen Bildes je Rasterzelle, ohne Ausgleich */
  private readonly sample: Float32Array;
  /** Mittlere Helligkeit des gelernten Hintergrunds */
  private meanLuma = 0;
  /** So viele Bilder sind bisher in den Hintergrund eingeflossen */
  private frames = 0;

  private readonly imageWidth: number;
  private readonly imageHeight: number;
  private readonly needed: number;
  private readonly minChange: number;
  private readonly adapt: number;
  private readonly minGain: number;
  private readonly maxGain: number;

  constructor(imageWidth: number, imageHeight: number, settings: FlightSettings) {
    this.imageWidth = imageWidth;
    this.imageHeight = imageHeight;
    this.step = Math.max(1, Math.floor(settings.sampleStep));
    this.gridWidth = Math.ceil(imageWidth / this.step);
    this.gridHeight = Math.ceil(imageHeight / this.step);
    this.cells = this.gridWidth * this.gridHeight;
    this.mask = new Uint8Array(this.cells);
    this.learned = new Float32Array(this.cells);
    this.sample = new Float32Array(this.cells);

    const fps = settings.fps > 0 ? settings.fps : 1;
    this.needed = Math.max(1, Math.round(settings.backgroundSeconds * fps));
    this.minChange = settings.minChange;
    this.adapt = Math.min(1, Math.max(0, settings.backgroundAdapt));
    this.minGain = settings.minGain;
    this.maxGain = settings.maxGain;
  }

  /** Der Hintergrund ist noch nicht fertig gelernt. */
  get isLearning(): boolean {
    return this.frames < this.needed;
  }

  /**
   * Verwirft den gelernten Hintergrund und beginnt von vorn — nötig, wenn sich
   * Licht oder Kameraposition dauerhaft geändert haben.
   */
  reset(): void {
    this.frames = 0;
    this.meanLuma = 0;
  }

  /**
   * Vergleicht ein Bild mit dem Hintergrund und füllt dabei `mask`.
   * Der Hintergrund selbst bleibt unverändert; ob und wie er übernommen wird,
   * entscheidet der Aufrufer mit `absorb` oder `follow`.
   */
  read(frame: FlightFrame): BackgroundReading {
    if (frame.width !== this.imageWidth || frame.height !== this.imageHeight) {
      throw new Error("Alle Bilder einer Aufnahme müssen dieselbe Größe haben.");
    }

    const { data } = frame;
    const { gridWidth, gridHeight, step, cells, sample, learned, mask } = this;
    let sum = 0;
    for (let gy = 0; gy < gridHeight; gy++) {
      const row = gy * step * frame.width;
      for (let gx = 0; gx < gridWidth; gx++) {
        const p = (row + gx * step) * 4;
        const value = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
        sample[gy * gridWidth + gx] = value;
        sum += value;
      }
    }

    const mean = cells > 0 ? sum / cells : 0;
    const learning = this.isLearning;
    // Belichtungsautomatik grob ausgleichen: Das Bild wird auf die Helligkeit
    // des Hintergrunds gerechnet. Während der Lernphase gibt es noch nichts,
    // worauf sich das rechnen ließe.
    const gain =
      this.frames > 0 && mean > 0
        ? Math.min(this.maxGain, Math.max(this.minGain, this.meanLuma / mean))
        : 1;

    let changed = 0;
    if (this.frames === 0) {
      // Ohne Hintergrund gibt es keine Abweichung — nur etwas zu lernen.
      mask.fill(CELL_BACKGROUND);
    } else {
      for (let i = 0; i < cells; i++) {
        if (Math.abs(sample[i] * gain - learned[i]) >= this.minChange) {
          mask[i] = CELL_FOREGROUND;
          changed++;
        } else {
          mask[i] = CELL_BACKGROUND;
        }
      }
    }

    return { changedShare: cells > 0 ? changed / cells : 0, learning, gain };
  }

  /**
   * Lernphase: Das zuletzt gelesene Bild fließt als gleichwertiger Teil in den
   * Mittelwert ein. Über die ersten Sekunden mittelt sich so das Bildrauschen
   * heraus.
   */
  absorb(): void {
    const weight = 1 / (this.frames + 1);
    const { cells, learned, sample } = this;
    let sum = 0;
    for (let i = 0; i < cells; i++) {
      const value = learned[i] + (sample[i] - learned[i]) * weight;
      learned[i] = value;
      sum += value;
    }
    this.meanLuma = cells > 0 ? sum / cells : 0;
    this.frames++;
  }

  /**
   * Nachführen nach der Lernphase: Nur Zellen ohne Abweichung wandern ein
   * kleines Stück in Richtung des aktuellen Bildes. Alles, was gerade auffällt
   * — Ball, Arm, Person — bleibt außen vor und kann den Hintergrund nicht
   * verfälschen.
   */
  follow(): void {
    if (this.adapt <= 0) return;
    const { cells, learned, sample, mask, adapt } = this;
    let sum = 0;
    for (let i = 0; i < cells; i++) {
      if (mask[i] === CELL_BACKGROUND) learned[i] += (sample[i] - learned[i]) * adapt;
      sum += learned[i];
    }
    this.meanLuma = cells > 0 ? sum / cells : 0;
  }
}
