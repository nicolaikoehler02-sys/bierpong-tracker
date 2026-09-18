import type { FlightFrame } from "./flight/index.ts";

/**
 * Bilder aus einer Videodatei holen — im Browser, ohne ffmpeg.
 *
 * Das Auswertungsskript lässt ffmpeg die Aufnahme in rohe RGBA-Bilder zerlegen.
 * Im Browser gibt es kein ffmpeg, aber ein `<video>`-Element und ein Canvas:
 * Die Datei wird Bild für Bild angesteuert, jedes Bild auf ein Canvas gezeichnet
 * und von dort als RGBA wieder ausgelesen. Heraus kommt dasselbe `FlightFrame`,
 * das auch aus ffmpeg fällt — der Erkennungskern merkt keinen Unterschied.
 *
 * **Warum angesteuert und nicht abgespielt?** Beim Abspielen liefert der Browser
 * die Bilder in Echtzeit und lässt bei Bedarf welche aus. Der Kern verlässt sich
 * aber darauf, dass die Bilder lückenlos und in der richtigen Reihenfolge
 * kommen: Die Bildnummer ist der Zeitpunkt. Ein ausgelassenes Bild würde alles
 * danach verschieben. Ansteuern ist langsamer, dafür kommt jedes Mal dieselbe
 * Bilderfolge heraus wie beim Skript.
 *
 * **Und langsamer heißt deutlich langsamer.** Ein Sprung im Video ist kein
 * Lesevorgang, sondern ein Neuaufsetzen: Der Browser springt zum letzten
 * Schlüsselbild davor und dekodiert von dort vorwärts. Bei den üblichen 250
 * Bildern zwischen zwei Schlüsselbildern sind das im Mittel gut hundert
 * dekodierte Bilder für jedes einzelne gewollte. Gemessen an der künstlichen
 * Aufnahme (640×360, 780 Bilder) waren das rund 170 Millisekunden je Bild,
 * zusammen gut zwei Minuten für 26 Sekunden Video — ungefähr das Fünffache der
 * Spieldauer. Deshalb gibt es einen Fortschrittsbalken und einen Abbruch, und
 * deshalb hört die Auswertung bei `maxFrames` auf.
 *
 * Nichts davon gehört in `lib/flight/`: Der Kern kennt nur Bilderfolgen, nicht
 * die Frage, woher sie kommen.
 */

/** So lange darf ein einzelner Sprung im Video dauern, bevor aufgegeben wird. */
const SEEK_TIMEOUT_MS = 15_000;

/**
 * So viele Bilder hat die Aufnahme bei dieser Bildrate — höchstens aber
 * `maxFrames`.
 *
 * Die Obergrenze ist dieselbe wie beim Skript (`--max-bilder`) und aus
 * demselben Grund da: Eine versehentlich ausgewählte Stunde Video soll den
 * Rechner nicht eine Stunde lang beschäftigen.
 */
export function frameCount(duration: number, fps: number, maxFrames: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(duration * fps), Math.max(0, Math.floor(maxFrames))));
}

/**
 * Der Zeitpunkt, an dem das Bild mit dieser Nummer abgegriffen wird — bewusst
 * die **Mitte** des Bildes und nicht sein Anfang.
 *
 * Bild `n` steht im Video von `n/fps` bis `(n+1)/fps`. Genau auf der Grenze
 * anzusteuern trifft je nach Rundung mal dieses, mal das vorige Bild; in der
 * Mitte gibt es diese Frage nicht.
 */
export function sampleTime(index: number, fps: number): number {
  return (index + 0.5) / fps;
}

/**
 * Die Bildgröße, in der ausgewertet wird: auf `targetWidth` verkleinert, das
 * Seitenverhältnis bleibt.
 *
 * Alle Größenangaben der Einstellungen (Ballgröße, Mindestweite eines Wurfs)
 * beziehen sich auf diese Breite — deshalb wird verkleinert und nicht in der
 * vollen Auflösung gerechnet. Gerade Kantenlängen, damit die Hälfte wieder
 * aufgeht.
 */
export function analysisSize(
  videoWidth: number,
  videoHeight: number,
  targetWidth: number,
): { width: number; height: number } {
  const width = even(targetWidth);
  if (!videoWidth || !videoHeight) return { width, height: width };
  return { width, height: even(Math.round((videoHeight / videoWidth) * width)) };
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** Springt im Video an eine Stelle und wartet, bis das Bild dort wirklich steht. */
export function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fail?: string) => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      if (fail) reject(new Error(fail));
      else resolve();
    };
    const onSeeked = () => done();
    const onError = () => done("Die Videodatei ließ sich nicht weiterlesen.");
    const timer = setTimeout(
      () => done(`Das Video reagiert nicht (Sprung auf ${time.toFixed(2)} s).`),
      SEEK_TIMEOUT_MS,
    );

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = time;
  });
}

/**
 * Zeichnet das gerade stehende Bild auf das Canvas und liest es wieder aus.
 *
 * Die Daten gehören dem Aufrufer: Er darf hineinmalen (siehe `paintOverlay`)
 * und das Bild danach wegwerfen oder mit `putImageData` wieder auf das Canvas
 * legen.
 */
export function grabImage(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): ImageData {
  ctx.drawImage(video, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Dasselbe Bild im Bildformat des Erkennungskerns — dieselben Daten, kein
 * Umkopieren.
 *
 * `ImageData` und `FlightFrame` sind Breite, Höhe und RGBA; dass beide dieselbe
 * Form haben, ist kein Zufall (siehe `FlightFrame`). Wer in das `FlightFrame`
 * malt, malt damit zugleich in das `ImageData`.
 */
export function toFlightFrame(image: ImageData): FlightFrame {
  return { width: image.width, height: image.height, data: image.data };
}

/** Wartet, bis Größe und Länge der Datei bekannt sind. */
export function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (fail?: string) => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      if (fail) reject(new Error(fail));
      else resolve();
    };
    const onLoaded = () => done();
    const onError = () => done("Diese Datei lässt sich im Browser nicht abspielen. MP4 oder WebM wählen.");
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
  });
}
