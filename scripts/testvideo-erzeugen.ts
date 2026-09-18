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
 * Dazu liegt im Bild eine **sichtbare vordere Tischkante** mit zwei hellen
 * Marken an ihren Enden. Ihre wahre Länge ist hier bekannt, weil wir das Bild
 * selbst zeichnen — deshalb wird neben der Aufnahme gleich die passende
 * Kalibrierungsdatei geschrieben, mit der sich der ganze Weg bis zu Zentimetern
 * und Metern je Sekunde durchspielen lässt.
 *
 *   npm run testvideo -- [zieldatei]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { TOURNAMENT_TABLE_LENGTH_CM, type TableCalibration } from "../lib/flight/index.ts";
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

/**
 * Die vordere Tischkante im Bild.
 *
 * Sie liegt knapp unter der Tischebene, damit sie keinem Ball ins Gehege kommt,
 * und ist die einzige Strecke im Bild, deren wahres Maß feststeht: `LENGTH_CM`.
 * Ein Turniertisch ist 2,40 m lang — genau der Wert, mit dem hier gezeichnet
 * wird, damit die Zahlen der Auswertung von Hand nachzurechnen sind.
 *
 * Maßstab dieser Aufnahme: 240 cm auf 560 Bildpunkten, also rund 0,43 cm je
 * Bildpunkt. Ein Flugbogen mit 180 Bildpunkten Scheitelhöhe ist damit gut 77 cm
 * hoch, und 500 Bildpunkte Weite sind rund 214 cm.
 */
const TABLE_EDGE = {
  left: 40,
  right: 600,
  y: 314,
  thickness: 6,
  /** Farbe der Kante: helleres Holz, deutlich von der dunklen Wand abgesetzt */
  color: "0x8c6f4a",
  /** Wahre Länge zwischen den beiden Marken in Zentimetern */
  LENGTH_CM: TOURNAMENT_TABLE_LENGTH_CM,
};

/** Die beiden hellen Marken an den Enden der Kante — daran wird von Hand markiert. */
const EDGE_MARK = { width: 4, height: 18, color: "0xd9c9a3" };

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

/**
 * Die Tischkante und ihre beiden Endmarken als ffmpeg-Ausdruck.
 *
 * Sie wird in den Hintergrund gezeichnet und steht still: Der Erkennungskern
 * lernt sie damit weg und macht aus ihr keinen Ball-Kandidaten.
 */
function drawTableEdge(): string {
  const mark = (x: number) =>
    `drawbox=x=${x - EDGE_MARK.width / 2}:y=${TABLE_EDGE.y - (EDGE_MARK.height - TABLE_EDGE.thickness) / 2}` +
    `:w=${EDGE_MARK.width}:h=${EDGE_MARK.height}:color=${EDGE_MARK.color}@1:t=fill`;
  return [
    `drawbox=x=${TABLE_EDGE.left}:y=${TABLE_EDGE.y}:w=${TABLE_EDGE.right - TABLE_EDGE.left}` +
      `:h=${TABLE_EDGE.thickness}:color=${TABLE_EDGE.color}@1:t=fill`,
    mark(TABLE_EDGE.left),
    mark(TABLE_EDGE.right),
  ].join(",");
}

/** Die Kalibrierung, die genau zu dieser gezeichneten Tischkante gehört. */
function calibration(): TableCalibration {
  return {
    edgeStart: { x: TABLE_EDGE.left, y: TABLE_EDGE.y },
    edgeEnd: { x: TABLE_EDGE.right, y: TABLE_EDGE.y },
    tableLengthCm: TABLE_EDGE.LENGTH_CM,
    referenceWidth: WIDTH,
  };
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
  const steps = [`[0:v]noise=alls=6:allf=t,${drawTableEdge()}[bg0]`];
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

  // Die Kalibrierung gleich mit ausliefern: Bei einer gezeichneten Aufnahme
  // kennen wir die wahre Tischlänge, bei einer echten muss sie gemessen werden.
  const calibrationFile = `${target.replace(/\.[^.\\/]+$/, "")}-kalibrierung.json`;
  await writeFile(calibrationFile, `${JSON.stringify(calibration(), null, 2)}\n`, "utf8");

  const edgeLength = TABLE_EDGE.right - TABLE_EDGE.left;
  const cmPerPixel = TABLE_EDGE.LENGTH_CM / edgeLength;

  console.log(`Testaufnahme geschrieben: ${path.resolve(target)}`);
  console.log(`${WIDTH}×${HEIGHT}, ${FPS} Bilder/s, ${DURATION} Sekunden.`);
  console.log(`  leerer Vorlauf bis ${ARCS[0].start} s`);
  for (const arc of ARCS) {
    const blur = arc.width > arc.height ? " (Streifen wie bei Bewegungsunschärfe)" : "";
    const side = arc.to > arc.from ? "von links" : "von rechts";
    const rise = (arc.rise * cmPerPixel).toFixed(0);
    const span = (Math.abs(arc.to - arc.from) * cmPerPixel).toFixed(0);
    console.log(
      `  Flugbogen ${arc.start}–${arc.end} s, ${side}${blur} — Scheitel ${arc.rise} px = ${rise} cm, Weite ${span} cm`,
    );
  }
  console.log(`  Person läuft durchs Bild ${PERSON.start}–${PERSON.end} s`);
  console.log(`  Lichtwechsel bei ${LIGHT_AT} s`);
  console.log(`  zurückrollender Ball ${ROLL.start}–${ROLL.end} s (kein Wurf)`);
  console.log("");
  console.log(
    `Tischkante: x ${TABLE_EDGE.left} bis ${TABLE_EDGE.right} bei y ${TABLE_EDGE.y} — ` +
      `${edgeLength} Bildpunkte entsprechen ${TABLE_EDGE.LENGTH_CM} cm (${cmPerPixel.toFixed(3)} cm je Bildpunkt).`,
  );
  console.log(`Kalibrierung geschrieben: ${path.resolve(calibrationFile)}`);
  console.log("");
  console.log("Auswerten mit echten Einheiten:");
  console.log(`  npm run analyse -- ${target} --kalibrierung ${calibrationFile}`);
  console.log("Auswerten ohne Kalibrierung (alles in Bildpunkten):");
  console.log(`  npm run analyse -- ${target}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
