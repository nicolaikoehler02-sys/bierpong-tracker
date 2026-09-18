/**
 * Hält die Erkennung gegen von Hand markierte Würfe und rechnet die Messlatte
 * aus der Spec aus: Anteil erkannter Würfe, Anteil richtig zugeordneter Seite,
 * Fehlalarme je 100 Würfe, Anteil erkannter Aufsetzer.
 *
 * Ab hier ist „funktioniert“ eine Zahl und keine Meinung.
 *
 *   npm run bewerten -- <markierungen.json> [Optionen]
 *
 * Gerechnet wird ausdrücklich nicht hier, sondern in `lib/flight/evaluation.ts`
 * — dort ist die Zuordnung getestet. Dieses Skript liest Dateien, ruft sie auf
 * und schreibt das Ergebnis lesbar hin.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type BenchmarkCheck,
  type DetectedThrow,
  type FlightSettings,
  type ThrowComparison,
  type ThrowScore,
  analyzeFlight,
  compareThrows,
  defaultFlightSettings,
  defaultMatchWindow,
  rateThrows,
} from "../lib/flight/index.ts";
import { decodeFrames, probeVideo } from "./lib/ffmpeg.ts";
import { readJsonFile } from "./lib/json-datei.ts";
import { type ThrowMarks, readMarks } from "./lib/marks.ts";

const HELP = `Erkennung gegen Handmarkierungen halten.

  npm run bewerten -- <markierungen.json> [Optionen]

Die Markierungsdatei enthält je Wurf einen Zeitpunkt in Sekunden und die Seite,
freiwillig dazu "bounce" für die Aufsetzer-Quote:

  { "throws": [ { "at": 12.4, "side": "links", "bounce": true },
                { "at": 15.9, "side": "rechts", "bounce": false } ] }

Verglichen wird gegen eine vorhandene Auswertung aus "npm run analyse". Ohne
Angabe wird sie unter analyse/<Name der Markierungsdatei>/ gesucht.

Optionen:
  --auswertung <datei>  JSON-Datei aus "npm run analyse"
  --video <datei>       Stattdessen die Aufnahme direkt auswerten (ohne Overlay-Video).
                        Langsamer, und es gelten die Standardwerte des Auswertungsskripts
                        — also ohne Kalibrierung. Die Aufsetzer-Einordnung läuft dann
                        allein über die Form der Bahn.
  --fenster <sekunden>  Zeitfenster der Zuordnung (Standard: ${defaultMatchWindow.toFixed(2)})
  --hilfe               Diese Hilfe anzeigen

Der Befehl endet mit Fehlercode, wenn die Messlatte nicht erreicht ist.
`;

/** Breite und Höchstzahl der Bilder wie im Auswertungsskript — sonst wären die Zahlen nicht vergleichbar. */
const VIDEO_WIDTH = 640;
const VIDEO_MAX_FRAMES = 1800;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      auswertung: { type: "string" },
      video: { type: "string" },
      fenster: { type: "string" },
      hilfe: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.hilfe) {
    console.log(HELP);
    return;
  }

  const marksFile = positionals[0];
  if (!marksFile) {
    console.error("Es fehlt die Datei mit den Handmarkierungen.\n");
    console.error(HELP);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(marksFile)) {
    console.error(`Handmarkierungen nicht gefunden: ${marksFile}`);
    process.exitCode = 1;
    return;
  }

  const window = number(values.fenster, defaultMatchWindow);
  const marks = await readMarks(marksFile);
  const name = path.basename(marksFile, path.extname(marksFile));

  const source = await loadDetected(name, values.auswertung, values.video);
  if (!source) {
    process.exitCode = 1;
    return;
  }

  const comparison = compareThrows(marks.throws, source.throws, window);
  const score = rateThrows(comparison);

  printHead(name, marksFile, marks, source, window);
  printMatches(comparison);
  printMissed(comparison);
  printExtra(comparison);
  printScore(score);

  if (!score.passed) process.exitCode = 1;
}

interface DetectedSource {
  /** Woher die erkannten Würfe stammen — Auswertungsdatei oder Aufnahme */
  label: string;
  throws: DetectedThrow[];
}

/**
 * Die erkannten Würfe kommen aus einer vorhandenen Auswertung. Die Aufnahme
 * direkt auszuwerten ist der Ausnahmeweg: Er dauert Minuten statt Sekunden und
 * liefert kein Overlay-Video, in dem sich ein verpasster Wurf nachsehen ließe.
 */
async function loadDetected(
  name: string,
  analysisFile: string | undefined,
  videoFile: string | undefined,
): Promise<DetectedSource | null> {
  if (analysisFile && videoFile) {
    console.error("Bitte entweder --auswertung oder --video angeben, nicht beides.");
    return null;
  }

  if (videoFile) {
    if (!existsSync(videoFile)) {
      console.error(`Aufnahme nicht gefunden: ${videoFile}`);
      return null;
    }
    return { label: path.resolve(videoFile), throws: await analyzeVideo(videoFile) };
  }

  const file = analysisFile ?? findAnalysis(name);
  if (!file) {
    console.error(
      `Keine Auswertung zu "${name}" gefunden. Erst "npm run analyse -- <videodatei>" laufen ` +
        `lassen, oder die JSON-Datei mit --auswertung angeben (oder die Aufnahme mit --video).`,
    );
    return null;
  }
  if (!existsSync(file)) {
    console.error(`Auswertung nicht gefunden: ${file}`);
    return null;
  }
  return { label: path.resolve(file), throws: await readAnalysis(file) };
}

/**
 * Die Auswertung liegt standardmäßig unter analyse/<Name>/<Name>.json — dort,
 * wo das Auswertungsskript sie hinschreibt. Heißt die Markierungsdatei wie die
 * Aufnahme, muss nichts angegeben werden.
 */
function findAnalysis(name: string): string | null {
  const candidates = [
    path.join("analyse", name, `${name}.json`),
    path.join("analyse", `${name}.json`),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** Liest die erkannten Würfe aus der JSON-Datei des Auswertungsskripts. */
async function readAnalysis(file: string): Promise<DetectedThrow[]> {
  let parsed: unknown;
  try {
    parsed = await readJsonFile(file);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Auswertung nicht lesbar (${file}): ${reason}`);
  }

  const raw = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (!Array.isArray(raw.throws)) {
    throw new Error(`Auswertung: "throws" fehlt oder ist keine Liste (${file}).`);
  }

  return raw.throws.map((entry, index) => {
    const found = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    if (!Number.isFinite(found.startedAt) || (found.side !== "links" && found.side !== "rechts")) {
      throw new Error(`Auswertung: Wurf ${index + 1} hat keinen Abwurfzeitpunkt und keine Seite (${file}).`);
    }
    return {
      nr: Number.isFinite(found.nr) ? (found.nr as number) : index + 1,
      at: found.startedAt as number,
      side: found.side,
      // Eine Auswertung von vor der Aufsetzer-Erkennung hat das Feld nicht.
      // Dann bleibt die Aufsetzer-Quote leer statt falsch.
      bounce: typeof found.bounce === "boolean" ? found.bounce : undefined,
    };
  });
}

/** Wertet eine Aufnahme direkt aus — derselbe Kern, nur ohne Tabellen und Overlay. */
async function analyzeVideo(file: string): Promise<DetectedThrow[]> {
  console.log(`Aufnahme: ${path.resolve(file)}`);
  const info = await probeVideo(file);
  const fps = info.fps > 0 ? Math.round(info.fps) : defaultFlightSettings.fps;
  const height = even(Math.round((info.height / info.width) * VIDEO_WIDTH));

  console.log("Zerlege die Aufnahme in Bilder …");
  const frames = await decodeFrames(file, {
    width: VIDEO_WIDTH,
    height,
    fps,
    maxFrames: VIDEO_MAX_FRAMES,
  });
  if (frames.length === 0) throw new Error("Die Aufnahme enthält keine auswertbaren Bilder.");

  console.log(`${frames.length} Bilder gelesen, werte sie aus …`);
  const settings: FlightSettings = { ...defaultFlightSettings, fps };
  return analyzeFlight(frames, settings).throws.map((found) => ({
    nr: found.nr,
    at: found.startedAt,
    side: found.side,
    bounce: found.bounce,
  }));
}

function printHead(
  name: string,
  marksFile: string,
  marks: ThrowMarks,
  source: DetectedSource,
  window: number,
): void {
  const left = marks.throws.filter((mark) => mark.side === "links").length;
  const bounces = marks.throws.filter((mark) => mark.bounce === true).length;
  const rated = marks.throws.filter((mark) => mark.bounce !== undefined).length;
  console.log("");
  console.log(`Aufnahme:          ${marks.recording ?? name}`);
  if (marks.note) console.log(`Notiz:             ${marks.note}`);
  console.log(
    `Handmarkierungen:  ${path.resolve(marksFile)}\n` +
      `                   ${marks.throws.length} markierte Würfe ` +
      `(${left} links, ${marks.throws.length - left} rechts)\n` +
      `                   ${rated} davon mit "bounce"-Angabe, ${bounces} als Aufsetzer markiert`,
  );
  console.log(`Auswertung:        ${source.label}\n                   ${source.throws.length} erkannte Würfe`);
  console.log(`Zeitfenster:       ${seconds(window)} s`);

  // Liegen zwei Markierungen enger beieinander als das Fenster, kann ein
  // einzelner erkannter Wurf nur einen von beiden abdecken — das ist gewollt,
  // aber man sollte es wissen, bevor man sich über die Zahl wundert.
  const close = marks.throws.filter(
    (mark, index) => index > 0 && mark.at - marks.throws[index - 1].at < window,
  ).length;
  if (close > 0) {
    console.log(
      `Achtung:           ${close} Markierungen liegen enger beieinander als das Zeitfenster. ` +
        `Notfalls mit --fenster verkleinern.`,
    );
  }
}

/** Die Zuordnung Zeile für Zeile — damit nachvollziehbar ist, was womit verglichen wurde. */
function printMatches(comparison: ThrowComparison): void {
  console.log("");
  if (comparison.matches.length === 0) {
    console.log("Zugeordnet: kein einziger Wurf.");
    return;
  }
  console.log("Zugeordnete Würfe:");
  console.log(
    ["  markiert", "Seite   ", "  erkannt", " Nr", "  Abstand", "Seite   ", "Art"].join("  "),
  );
  for (const match of comparison.matches) {
    const notes = [
      match.sideCorrect ? "" : "Seite verwechselt",
      match.bounceCorrect === false
        ? match.detected.bounce
          ? "direkter Wurf als Aufsetzer gezählt"
          : "Aufsetzer übersehen"
        : "",
    ].filter(Boolean);
    console.log(
      [
        `${seconds(match.mark.at)} s`.padStart(10),
        match.mark.side.padEnd(8),
        `${seconds(match.detected.at)} s`.padStart(9),
        String(match.detected.nr).padStart(3),
        `${match.offset >= 0 ? "+" : "-"}${seconds(Math.abs(match.offset))} s`.padStart(9),
        match.detected.side.padEnd(8),
        kind(match.detected.bounce).padEnd(9),
        notes.join(", "),
      ].join("  ").trimEnd(),
    );
  }
}

/** Die Einordnung eines Wurfs als Wort — „?“, wenn die Auswertung sie nicht kennt. */
function kind(bounce: boolean | undefined): string {
  if (bounce === undefined) return "?";
  return bounce ? "Aufsetzer" : "direkt";
}

/**
 * Die verpassten Markierungen einzeln mit Zeitpunkt — das ist der Zweck der
 * ganzen Übung: Jede Zeile hier ist eine Stelle, die sich im Overlay-Video
 * ansehen lässt.
 */
function printMissed(comparison: ThrowComparison): void {
  console.log("");
  if (comparison.missed.length === 0) {
    console.log("Verpasste Markierungen: keine.");
    return;
  }
  console.log(`Verpasste Markierungen (${comparison.missed.length}) — im Overlay-Video nachsehen:`);
  for (const mark of comparison.missed) {
    console.log(
      `  bei ${seconds(mark.at)} s, markiert als ${mark.side}${mark.note ? ` — ${mark.note}` : ""}`,
    );
  }
}

/** Die Fehlalarme einzeln mit Zeitpunkt und Wurfnummer aus der Auswertung. */
function printExtra(comparison: ThrowComparison): void {
  console.log("");
  if (comparison.extra.length === 0) {
    console.log("Zusätzlich erfundene Würfe: keine.");
    return;
  }
  console.log(`Zusätzlich erfundene Würfe (${comparison.extra.length}) — im Overlay-Video nachsehen:`);
  for (const found of comparison.extra) {
    console.log(`  Wurf ${found.nr} bei ${seconds(found.at)} s, erkannt als ${found.side}`);
  }
}

function printScore(score: ThrowScore): void {
  console.log("");
  console.log("Messlatte aus der Spec:");
  console.log(
    line("Erkannte Würfe", `${score.matched} von ${score.marks}`, percent(score.recall), "mindestens", score.recall),
  );
  console.log(
    line(
      "Richtige Seite",
      `${score.sideCorrect} von ${score.matched}`,
      percent(score.sideAccuracy),
      "mindestens",
      score.sideAccuracy,
    ),
  );
  console.log(
    line(
      "Fehlalarme je 100 Würfe",
      `${score.extra} auf ${score.marks}`,
      score.falseAlarms.value === null ? "—" : score.falseAlarms.value.toFixed(1),
      "höchstens",
      score.falseAlarms,
      score.falseAlarms.target.toFixed(1),
    ),
  );

  console.log(
    line(
      "Erkannte Aufsetzer",
      `${score.bounceFound} von ${score.bounceMarked}`,
      percent(score.bounceRecall),
      "mindestens",
      score.bounceRecall,
    ),
  );

  // Der umgekehrte Fehler hat keine Messlatte in der Spec — aber er ist der
  // teurere: Ein Aufsetzer bringt nach Regelwerk einen Becher extra, und eine
  // Aufsetzerquote, die nur deshalb gut aussieht, weil die Erkennung überall
  // einen Aufsetzer sieht, ist wertlos. Deshalb steht er daneben.
  console.log(
    [
      ` ${"davon erfundene Aufsetzer".padEnd(24)}`,
      `${score.directAsBounce} von ${score.directMarked}`.padStart(11),
      (score.falseBounceShare === null
        ? "—"
        : `${(score.falseBounceShare * 100).toFixed(1)} %`
      ).padStart(9),
      "  (direkte Würfe, die als Aufsetzer gelten)",
    ].join(" "),
  );

  // Ohne `bounce` in den Handmarkierungen gibt es zur Aufsetzer-Quote nichts zu
  // sagen — dann soll dastehen, warum, statt einer leeren Zahl.
  const unrated = score.matched - score.bounceRated;
  if (unrated > 0) {
    console.log(
      ` ${"".padEnd(24)} ${unrated} zugeordnete ${unrated === 1 ? "Wurf trägt" : "Würfe tragen"} ` +
        `keine "bounce"-Angabe und ${unrated === 1 ? "bleibt" : "bleiben"} bei der Aufsetzer-Quote außen vor.`,
    );
  }

  console.log("");
  console.log(score.passed ? "BESTANDEN" : "NICHT BESTANDEN");
}

function line(
  label: string,
  counts: string,
  value: string,
  direction: "mindestens" | "höchstens",
  check: BenchmarkCheck,
  target = percentValue(check.target),
): string {
  return [
    ` ${label.padEnd(24)}`,
    counts.padStart(11),
    value.padStart(9),
    `  Messlatte ${direction} ${target}`.padEnd(32),
    check.value === null ? "nicht bewertbar" : check.passed ? "bestanden" : "NICHT bestanden",
  ].join(" ");
}

function percent(check: BenchmarkCheck): string {
  return check.value === null ? "—" : `${(check.value * 100).toFixed(1)} %`;
}

function percentValue(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

/** Zeitpunkte durchgehend mit zwei Nachkommastellen — ein Bild bei 30 Bildern/s sind 0,03 s. */
function seconds(value: number): string {
  return value.toFixed(2);
}

function number(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Ungültiger Zahlenwert: ${value}`);
  }
  return parsed;
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
