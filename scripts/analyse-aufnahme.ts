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
import { type FlightSettings, analyzeFlight, defaultFlightSettings, paintOverlay } from "../lib/flight/index.ts";
import { decodeFrames, encodeVideo, probeVideo } from "./lib/ffmpeg.ts";
import { summarize, toCsv, toJson } from "./lib/report.ts";

const HELP = `Aufnahme der Seitenkamera auswerten.

  npm run analyse -- <videodatei> [Optionen]

Optionen:
  --breite <px>         Breite, auf die die Bilder verkleinert werden (Standard: 640)
  --fps <zahl>          Bilder pro Sekunde für die Auswertung (Standard: aus der Aufnahme)
  --max-bilder <zahl>   Höchstzahl ausgewerteter Bilder (Standard: 1800)
  --ausgabe <ordner>    Zielordner (Standard: analyse/<Name der Aufnahme>)
  --ohne-video          Nur Tabelle und JSON schreiben, kein Overlay-Video
  --hilfe               Diese Hilfe anzeigen
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      breite: { type: "string" },
      fps: { type: "string" },
      "max-bilder": { type: "string" },
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

  const settings: FlightSettings = { ...defaultFlightSettings, fps };

  console.log("Zerlege die Aufnahme in Bilder …");
  const frames = await decodeFrames(source, { width: targetWidth, height: targetHeight, fps, maxFrames });
  if (frames.length === 0) {
    console.error("Die Aufnahme enthält keine auswertbaren Bilder.");
    process.exitCode = 1;
    return;
  }
  console.log(`${frames.length} Bilder gelesen.`);

  console.log("Werte die Bilder aus …");
  const results = analyzeFlight(frames, settings);

  await mkdir(outDir, { recursive: true });
  const csvFile = path.join(outDir, `${name}.csv`);
  const jsonFile = path.join(outDir, `${name}.json`);
  const videoFile = path.join(outDir, `${name}-overlay.mp4`);

  await writeFile(csvFile, toCsv(results), "utf8");
  await writeFile(
    jsonFile,
    toJson(results, { source: path.resolve(source), width: targetWidth, height: targetHeight, settings }),
    "utf8",
  );

  if (!values["ohne-video"]) {
    console.log("Zeichne die Markierungen ins Bild und schreibe das Overlay-Video …");
    results.forEach((result, index) => paintOverlay(frames[index], result));
    await encodeVideo(videoFile, frames, { width: targetWidth, height: targetHeight, fps });
  }

  const summary = summarize(results);
  console.log("");
  console.log(`Bilder ausgewertet:      ${summary.frames}`);
  console.log(`Veränderungen gefunden:  ${summary.detected}`);
  console.log(`Szenenwechsel:           ${summary.sceneChanges}`);
  console.log("");
  console.log("Geschrieben:");
  if (!values["ohne-video"]) console.log(`  ${path.resolve(videoFile)}`);
  console.log(`  ${path.resolve(csvFile)}`);
  console.log(`  ${path.resolve(jsonFile)}`);
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
