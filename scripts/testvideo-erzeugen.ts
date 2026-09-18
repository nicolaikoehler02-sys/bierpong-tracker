/**
 * Erzeugt eine künstliche Aufnahme, an der sich der ganze Weg von Hand
 * nachsehen lässt. Echtes Material der Seitenkamera gibt es noch nicht.
 *
 * Die Aufnahme enthält absichtlich alle fünf Fälle, die der Erkennungskern
 * auseinanderhalten muss:
 *
 * 1. **Leerer Vorlauf** — daraus lernt der Kern den Hintergrund.
 * 2. **Flugbögen** — drei Würfe, einer davon als Streifen wie bei
 *    Bewegungsunschärfe. Genau diese drei müssen in der Wurftabelle stehen,
 *    mit der Seite, die zur Flugrichtung passt.
 * 3. **Störende Person** — läuft durch das Bild und darf keinen Kandidaten
 *    erzeugen.
 * 4. **Lichtwechsel** — schaltet die Helligkeit sprunghaft hoch. Danach lernt
 *    der Kern den Hintergrund neu, und der letzte Flugbogen wird wieder
 *    gefunden.
 * 5. **Zurückrollender Ball** — läuft langsam und flach über den Tisch zurück
 *    und darf kein Wurf sein.
 *
 *   npm run testvideo -- [zieldatei]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { run, toolPath } from "./lib/ffmpeg.ts";

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 30;
const DURATION = 22;

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

/** Höhe der Tischebene im Bild — dort beginnt und endet jeder Flugbogen. */
const TABLE_Y = 300;

interface Ball {
  from: number;
  to: number;
  start: number;
  end: number;
  /** Größe des Balls im Bild — in die Länge gezogen bedeutet Bewegungsunschärfe */
  width: number;
  height: number;
  /** Scheitelhöhe über der Tischebene in Bildpunkten; 0 heißt: rollt flach über den Tisch */
  rise: number;
}

/** Drei Flugbögen: nach rechts, zurück, und einer nach dem Lichtwechsel. */
const ARCS: Ball[] = [
  { from: 60, to: 560, start: 3.4, end: 4.2, width: 12, height: 12, rise: 180 },
  { from: 560, to: 60, start: 5.4, end: 6.2, width: 28, height: 12, rise: 180 },
  { from: 60, to: 560, start: 16.5, end: 17.3, width: 12, height: 12, rise: 180 },
];

/**
 * Der zurückrollende Ball: dieselbe Strecke wie ein Wurf, aber flach über den
 * Tisch und in drei statt in nicht einmal einer Sekunde. Er darf kein Wurf
 * sein — rund 170 Bildpunkte je Sekunde liegen deutlich unter der Grenze, ab
 * der eine Bahn als geworfen gilt.
 */
const ROLL: Ball = { from: 560, to: 60, start: 18.2, end: 21.2, width: 12, height: 12, rise: 0 };

const BALLS: Ball[] = [...ARCS, ROLL];

/**
 * Ein Ball als ffmpeg-Ausdruck: gleichmäßig zur Seite, Parabel nach oben.
 * Gezeichnet wird mit `overlay`, nicht mit `drawbox` — dort ist `t` die
 * Linienstärke und nicht der Zeitpunkt.
 */
function overlayFor(ball: Ball): string {
  const u = `((t-${ball.start})/${ball.end - ball.start})`;
  const x = `${ball.from}+${ball.to - ball.from}*${u}`;
  // Scheitel des Bogens bei halber Strecke; ohne Scheitelhöhe bleibt der Ball
  // auf der Tischebene und rollt.
  const y = ball.rise > 0 ? `${TABLE_Y}-${4 * ball.rise}*${u}*(1-${u})` : `${TABLE_Y}`;
  return `overlay=x='${x}':y='${y}':enable='between(t,${ball.start},${ball.end})'`;
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
  for (const ball of BALLS) {
    inputs.push("-f", "lavfi", "-i", `color=c=${BALL_COLOR}:s=${ball.width}x${ball.height}:d=${DURATION}:r=${FPS}`);
  }
  inputs.push(
    "-f",
    "lavfi",
    "-i",
    `color=c=${PERSON_COLOR}:s=${PERSON.width}x${PERSON.height}:d=${DURATION}:r=${FPS}`,
  );

  // Rauschen auf den Hintergrund, dann Bälle und Person darüber, zuletzt der
  // Lichtwechsel über das fertige Bild — so trifft er alles gleichzeitig.
  const overlays = [...BALLS.map(overlayFor), overlayForPerson()];
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
    const side = arc.to > arc.from ? "von links" : "von rechts";
    console.log(`  Flugbogen ${arc.start}–${arc.end} s, ${side}${blur}`);
  }
  console.log(`  Person läuft durchs Bild ${PERSON.start}–${PERSON.end} s`);
  console.log(`  Lichtwechsel bei ${LIGHT_AT} s`);
  console.log(`  zurückrollender Ball ${ROLL.start}–${ROLL.end} s (kein Wurf)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
