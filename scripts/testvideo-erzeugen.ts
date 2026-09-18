/**
 * Erzeugt eine künstliche Aufnahme, an der sich der ganze Weg von Hand
 * nachsehen lässt. Echtes Material der Seitenkamera gibt es noch nicht.
 *
 * Die Aufnahme enthält absichtlich alle vier Fälle, die der Erkennungskern
 * auseinanderhalten muss:
 *
 * 1. **Leerer Vorlauf** — daraus lernt der Kern den Hintergrund.
 * 2. **Flugbögen** — zwei Bälle, einer davon als Streifen wie bei
 *    Bewegungsunschärfe. Beide müssen im Overlay markiert sein.
 * 3. **Störende Person** — läuft durch das Bild und darf keinen Kandidaten
 *    erzeugen.
 * 4. **Lichtwechsel** — schaltet die Helligkeit sprunghaft hoch. Danach lernt
 *    der Kern den Hintergrund neu, und der letzte Flugbogen wird wieder
 *    gefunden.
 *
 *   npm run testvideo -- [zieldatei]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { run, toolPath } from "./lib/ffmpeg.ts";

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 30;
const DURATION = 19;

/** Dunkle Holzwand, leicht verrauscht — näher am echten Raum als reines Schwarz. */
const BACKGROUND = "0x3a2a18";
const BALL_COLOR = "white";
/** Kleidung: deutlich heller als die Wand, damit die Person wirklich auffällt. */
const PERSON_COLOR = "0x8a7f74";

/** Ab hier brennt das helle Licht — sprunghaft, wie ein umgelegter Schalter. */
const LIGHT_AT = 13;
/** Helligkeitssprung des Lichtwechsels (ffmpeg `eq`: −1 bis 1, entspricht ±255). */
const LIGHT_STEP = 0.42;

/** Die Person läuft von links nach rechts durch das Bild. */
const PERSON = { width: 60, height: 220, start: 7.5, end: 11.5 };

interface Arc {
  from: number;
  to: number;
  start: number;
  end: number;
  /** Größe des Balls im Bild — in die Länge gezogen bedeutet Bewegungsunschärfe */
  width: number;
  height: number;
}

/** Drei Flugbögen: nach rechts, zurück, und einer nach dem Lichtwechsel. */
const ARCS: Arc[] = [
  { from: 60, to: 560, start: 3.4, end: 4.2, width: 12, height: 12 },
  { from: 560, to: 60, start: 5.4, end: 6.2, width: 28, height: 12 },
  { from: 60, to: 560, start: 16.5, end: 17.3, width: 12, height: 12 },
];

/**
 * Ein Flugbogen als ffmpeg-Ausdruck: gleichmäßig zur Seite, Parabel nach oben.
 * Gezeichnet wird mit `overlay`, nicht mit `drawbox` — dort ist `t` die
 * Linienstärke und nicht der Zeitpunkt.
 */
function overlayFor(arc: Arc): string {
  const u = `((t-${arc.start})/${arc.end - arc.start})`;
  const x = `${arc.from}+${arc.to - arc.from}*${u}`;
  // Scheitel des Bogens bei halber Strecke, 180 Bildpunkte über dem Abwurf.
  const y = `300-720*${u}*(1-${u})`;
  return `overlay=x='${x}':y='${y}':enable='between(t,${arc.start},${arc.end})'`;
}

/** Die Person geht gleichmäßig durchs Bild und tritt an beiden Rändern halb heraus. */
function overlayForPerson(): string {
  const u = `((t-${PERSON.start})/${PERSON.end - PERSON.start})`;
  const x = `${-PERSON.width}+${WIDTH + 2 * PERSON.width}*${u}`;
  return `overlay=x='${x}':y=${HEIGHT - PERSON.height}:enable='between(t,${PERSON.start},${PERSON.end})'`;
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? path.join("analyse", "testvideo", "testwurf.mp4");
  await mkdir(path.dirname(target), { recursive: true });

  const inputs = ["-f", "lavfi", "-i", `color=c=${BACKGROUND}:s=${WIDTH}x${HEIGHT}:d=${DURATION}:r=${FPS}`];
  for (const arc of ARCS) {
    inputs.push("-f", "lavfi", "-i", `color=c=${BALL_COLOR}:s=${arc.width}x${arc.height}:d=${DURATION}:r=${FPS}`);
  }
  inputs.push(
    "-f",
    "lavfi",
    "-i",
    `color=c=${PERSON_COLOR}:s=${PERSON.width}x${PERSON.height}:d=${DURATION}:r=${FPS}`,
  );

  // Rauschen auf den Hintergrund, dann Bälle und Person darüber, zuletzt der
  // Lichtwechsel über das fertige Bild — so trifft er alles gleichzeitig.
  const overlays = [...ARCS.map(overlayFor), overlayForPerson()];
  const steps = ["[0:v]noise=alls=6:allf=t[bg0]"];
  overlays.forEach((overlay, index) => {
    steps.push(`[bg${index}][${index + 1}:v]${overlay}[bg${index + 1}]`);
  });
  steps.push(
    `[bg${overlays.length}]eq=brightness=${LIGHT_STEP}:enable='gte(t,${LIGHT_AT})',format=yuv420p[out]`,
  );

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
  console.log(`${WIDTH}×${HEIGHT}, ${FPS} Bilder/s, ${DURATION} Sekunden.`);
  console.log(`  leerer Vorlauf bis ${ARCS[0].start} s`);
  for (const arc of ARCS) {
    const blur = arc.width > arc.height ? " (Streifen wie bei Bewegungsunschärfe)" : "";
    console.log(`  Flugbogen ${arc.start}–${arc.end} s${blur}`);
  }
  console.log(`  Person läuft durchs Bild ${PERSON.start}–${PERSON.end} s`);
  console.log(`  Lichtwechsel bei ${LIGHT_AT} s`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
