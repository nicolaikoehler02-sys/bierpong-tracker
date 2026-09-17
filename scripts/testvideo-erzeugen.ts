/**
 * Erzeugt eine künstliche Aufnahme zum Prüfen des ganzen Weges: ein heller
 * Punkt fliegt in zwei Bögen über einen dunklen Hintergrund — einmal nach
 * rechts, einmal zurück. Echtes Material der Seitenkamera gibt es noch nicht.
 *
 *   npm run testvideo -- [zieldatei]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { run, toolPath } from "./lib/ffmpeg.ts";

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 30;
const DURATION = 4;
const BALL = 12;

interface Arc {
  from: number;
  to: number;
  start: number;
  end: number;
}

/** Zwei Flugbögen: erst nach rechts, dann zurück. */
const ARCS: Arc[] = [
  { from: 60, to: 560, start: 0.5, end: 1.3 },
  { from: 560, to: 60, start: 2.2, end: 3.0 },
];

/**
 * Ein Flugbogen als ffmpeg-Ausdruck: gleichmäßig zur Seite, Parabel nach oben.
 * Gezeichnet wird mit `overlay`, nicht mit `drawbox` — dort ist `t` die
 * Linienstärke und nicht der Zeitpunkt.
 */
function overlayFor(arc: Arc): string {
  const u = `((t-${arc.start})/${arc.end - arc.start})`;
  const x = `${arc.from}+${arc.to - arc.from}*${u}`;
  // Scheitel des Bogens bei halber Strecke, 180 Pixel über dem Abwurf.
  const y = `300-720*${u}*(1-${u})`;
  return `overlay=x='${x}':y='${y}':enable='between(t,${arc.start},${arc.end})'`;
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? path.join("analyse", "testvideo", "testwurf.mp4");
  await mkdir(path.dirname(target), { recursive: true });

  // Dunkler Hintergrund mit leichtem Rauschen — näher an der Holzwand als reines Schwarz.
  const steps = ["[0:v]noise=alls=6:allf=t[bg0]"];
  ARCS.forEach((arc, index) => {
    const last = index === ARCS.length - 1;
    const tail = last ? ",format=yuv420p[out]" : `[bg${index + 1}]`;
    steps.push(`[bg${index}][${index + 1}:v]${overlayFor(arc)}${tail}`);
  });

  const inputs = ["-f", "lavfi", "-i", `color=c=0x3a2a18:s=${WIDTH}x${HEIGHT}:d=${DURATION}:r=${FPS}`];
  for (let index = 0; index < ARCS.length; index++) {
    inputs.push("-f", "lavfi", "-i", `color=c=white:s=${BALL}x${BALL}:d=${DURATION}:r=${FPS}`);
  }

  await run(toolPath("ffmpeg"), [
    "-v",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    steps.join(";"),
    "-map",
    "[out]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    target,
  ]);

  console.log(`Testaufnahme geschrieben: ${path.resolve(target)}`);
  console.log(`${WIDTH}×${HEIGHT}, ${FPS} Bilder/s, ${DURATION} Sekunden, ${ARCS.length} Flugbögen.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
