/**
 * Wertet eine Aufnahme der Seitenkamera offline aus (siehe ADR 0002).
 *
 * Ablauf: ffmpeg zerlegt die Aufnahme in Bilder, der Erkennungskern wertet sie
 * aus, heraus kommen Overlay-Video, CSV-Tabelle und JSON-Datei.
 *
 *   npm run analyse -- <videodatei> [Optionen]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  type FlightSettings,
  type TableCalibration,
  type Throw,
  analyzeFlight,
  defaultFlightSettings,
  paintOverlay,
} from "../lib/flight/index.ts";
import { readCalibration } from "./lib/calibration.ts";
import { decodeFrames, encodeVideo, probeVideo } from "./lib/ffmpeg.ts";
import { candidatesToCsv, summarize, throwsToCsv, toJson } from "./lib/report.ts";

const HELP = `Aufnahme der Seitenkamera auswerten.

  npm run analyse -- <videodatei> [Optionen]

Optionen:
  --breite <px>           Breite, auf die die Bilder verkleinert werden (Standard: 640)
  --fps <zahl>            Bilder pro Sekunde für die Auswertung (Standard: aus der Aufnahme)
  --max-bilder <zahl>     Höchstzahl ausgewerteter Bilder (Standard: 1800)
  --kalibrierung <datei>  JSON mit zwei Punkten auf der vorderen Tischkante und der
                          Tischlänge in Zentimetern. Ohne diese Angabe läuft die
                          Auswertung in Bildpunkten weiter.
  --ausgabe <ordner>      Zielordner (Standard: analyse/<Name der Aufnahme>)
  --ohne-video            Nur Tabelle und JSON schreiben, kein Overlay-Video
  --hilfe                 Diese Hilfe anzeigen
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      breite: { type: "string" },
      fps: { type: "string" },
      "max-bilder": { type: "string" },
      kalibrierung: { type: "string" },
      ausgabe: { type: "string", short: "o" },
      "ohne-video": { type: "boolean", default: false },
      hilfe: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.hilfe) {
    console.log(HELP);
    return;
  }

  const source = positionals[0];
  if (!source) {
    console.error("Es fehlt die Videodatei.\n");
    console.error(HELP);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(source)) {
    console.error(`Aufnahme nicht gefunden: ${source}`);
    process.exitCode = 1;
    return;
  }

  const name = path.basename(source, path.extname(source));
  const outDir = values.ausgabe ?? path.join("analyse", name);
  const targetWidth = even(number(values.breite, 640));
  const maxFrames = number(values["max-bilder"], 1800);

  console.log(`Aufnahme: ${path.resolve(source)}`);
  const info = await probeVideo(source);
  const fps = number(values.fps, info.fps > 0 ? Math.round(info.fps) : defaultFlightSettings.fps);
  // Seitenverhältnis beibehalten; x264 braucht gerade Kantenlängen.
  const targetHeight = even(Math.round((info.height / info.width) * targetWidth));
  console.log(
    `Original: ${info.width}×${info.height} bei ${info.fps.toFixed(2)} Bildern/s — ` +
      `ausgewertet wird ${targetWidth}×${targetHeight} bei ${fps} Bildern/s.`,
  );

  // Die Kalibrierung ist freiwillig: Ohne sie stehen alle Kennzahlen in
  // Bildpunkten, die Erkennung selbst ändert sich dadurch nicht.
  let calibration: TableCalibration | null = null;
  if (values.kalibrierung) {
    if (!existsSync(values.kalibrierung)) {
      console.error(`Kalibrierung nicht gefunden: ${values.kalibrierung}`);
      process.exitCode = 1;
      return;
    }
    calibration = await readCalibration(values.kalibrierung);
    // Markiert wird meist in der vollen Auflösung der Aufnahme, ausgewertet in
    // der verkleinerten. Fehlt die Angabe, gilt die volle Breite als Bezug.
    calibration.referenceWidth ??= info.width;
  }

  const settings: FlightSettings = { ...defaultFlightSettings, fps, calibration };

  console.log("Zerlege die Aufnahme in Bilder …");
  const frames = await decodeFrames(source, { width: targetWidth, height: targetHeight, fps, maxFrames });
  if (frames.length === 0) {
    console.error("Die Aufnahme enthält keine auswertbaren Bilder.");
    process.exitCode = 1;
    return;
  }
  console.log(`${frames.length} Bilder gelesen.`);

  console.log("Werte die Bilder aus …");
  const analysis = analyzeFlight(frames, settings);

  if (analysis.scale) {
    console.log(
      `Kalibrierung: ${analysis.scale.tableLengthCm} cm Tischkante auf ` +
        `${analysis.scale.edgeLength.toFixed(1)} Bildpunkten — ` +
        `${analysis.scale.cmPerPixel.toFixed(3)} cm je Bildpunkt.`,
    );
  } else if (calibration) {
    console.log(
      "Die Kalibrierung ist unbrauchbar (Punkte zu dicht beieinander). " +
        "Es wird in Bildpunkten gerechnet.",
    );
  } else {
    console.log("Ohne Kalibrierung — alle Kennzahlen stehen in Bildpunkten.");
  }

  await mkdir(outDir, { recursive: true });
  const throwsFile = path.join(outDir, `${name}.csv`);
  const candidatesFile = path.join(outDir, `${name}-kandidaten.csv`);
  const jsonFile = path.join(outDir, `${name}.json`);
  const videoFile = path.join(outDir, `${name}-overlay.mp4`);

  await writeFile(throwsFile, throwsToCsv(analysis.throws), "utf8");
  await writeFile(candidatesFile, candidatesToCsv(analysis.frames), "utf8");
  await writeFile(
    jsonFile,
    toJson(analysis, { source: path.resolve(source), width: targetWidth, height: targetHeight, settings }),
    "utf8",
  );

  if (!values["ohne-video"]) {
    console.log("Zeichne die Markierungen ins Bild und schreibe das Overlay-Video …");
    analysis.frames.forEach((result, index) => paintOverlay(frames[index], result, analysis.throws));
    await encodeVideo(videoFile, frames, { width: targetWidth, height: targetHeight, fps });
  }

  const summary = summarize(analysis);
  console.log("");
  printThrows(analysis.throws, analysis.scale !== null);
  console.log("");
  console.log(`Bilder ausgewertet:      ${summary.frames}`);
  console.log(`Bilder Lernphase:        ${summary.learningFrames}`);
  console.log(`Ball-Kandidaten:         ${summary.candidates} in ${summary.framesWithCandidates} Bildern`);
  console.log(`Szenenwechsel:           ${summary.sceneChanges}`);
  console.log(
    `Würfe:                   ${summary.throws} (${summary.throwsLeft} von links, ${summary.throwsRight} von rechts)`,
  );
  console.log(
    `Aufsetzer:               ${summary.bounces} von ${summary.throws}` +
      (analysis.scale === null && summary.throws > 0
        ? " — ohne Kalibrierung allein aus der Form der Bahn"
        : ""),
  );
  console.log("");
  console.log("Geschrieben:");
  if (!values["ohne-video"]) console.log(`  ${path.resolve(videoFile)}`);
  console.log(`  ${path.resolve(throwsFile)}`);
  console.log(`  ${path.resolve(candidatesFile)}`);
  console.log(`  ${path.resolve(jsonFile)}`);
}

/**
 * Die Wurftabelle direkt im Terminal — dieselben Zahlen wie in der CSV-Datei.
 *
 * Mit Kalibrierung stehen hier Zentimeter und Meter je Sekunde, ohne sie
 * Bildpunkte. In der CSV-Datei stehen immer beide.
 *
 * Die letzte Spalte ordnet jeden Wurf ein: Aufsetzer oder direkt. Beim
 * Aufsetzer steht der geschätzte Aufprall dabei — Zeitpunkt und Stelle. Der
 * Zeitpunkt liegt zwischen zwei Bildern; das ist kein Rundungsfehler, sondern
 * der Zweck der Schätzung.
 */
function printThrows(throws: readonly Throw[], calibrated: boolean): void {
  if (throws.length === 0) {
    console.log("Kein Wurf erkannt.");
    return;
  }
  console.log("Nr  Abwurf    Dauer   Seite    Scheitel     Weite       Tempo  Art");
  for (const found of throws) {
    const { metrics } = found;
    const bounce = found.bouncePoint;
    console.log(
      [
        String(found.nr).padStart(2),
        `${found.startedAt.toFixed(2)} s`.padStart(8),
        `${metrics.duration.toFixed(2)} s`.padStart(7),
        found.side.padEnd(8),
        calibrated
          ? `${metrics.peakHeightCm?.toFixed(0)} cm`.padStart(8)
          : `${metrics.peakHeight.toFixed(0)} px`.padStart(8),
        calibrated
          ? `${metrics.spanCm?.toFixed(0)} cm`.padStart(8)
          : `${metrics.span.toFixed(0)} px`.padStart(8),
        calibrated
          ? `${metrics.speedMps?.toFixed(1)} m/s`.padStart(10)
          : `${metrics.speed.toFixed(0)} px/s`.padStart(10),
        bounce
          ? `Aufsetzer bei ${bounce.at.toFixed(3)} s ` +
            `(x ${bounce.x.toFixed(0)}, y ${bounce.y.toFixed(0)})`
          : "direkt",
      ].join("  "),
    );
  }
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
