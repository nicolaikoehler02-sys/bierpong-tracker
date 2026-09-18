"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CalibrationPoint,
  type FlightAnalysis,
  type FlightSettings,
  FlightRun,
  TOURNAMENT_TABLE_LENGTH_CM,
  type TableCalibration,
  type Throw,
  defaultFlightSettings,
  paintOverlay,
  summarize,
} from "@/lib/flight";
import {
  analysisSize,
  frameCount,
  grabImage,
  sampleTime,
  seekTo,
  toFlightFrame,
  waitForMetadata,
} from "@/lib/video-frames";

/**
 * Breite, auf die die Bilder verkleinert werden — dieselbe wie die Voreinstellung
 * des Auswertungsskripts (`--breite`). Alle Größenangaben der Einstellungen
 * beziehen sich darauf; eine andere Breite würde andere Würfe ergeben.
 */
const ANALYSIS_WIDTH = 640;
/** Voreinstellung des Skripts (`--max-bilder`): eine Minute bei 30 Bildern/s. */
const DEFAULT_MAX_FRAMES = 1800;
/** So oft wird der Fortschritt gemeldet — jedes Bild wäre nur Arbeit für nichts. */
const PROGRESS_EVERY = 5;

type Status = "leer" | "bereit" | "laeuft" | "fertig" | "fehler";
type View = "vorschau" | "overlay";

const zahl = (value: number, digits = 0) => value.toFixed(digits).replace(".", ",");
const sekunden = (value: number, digits = 2) => `${zahl(value, digits)} s`;

export function AufnahmeAuswertung() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [fps, setFps] = useState(defaultFlightSettings.fps);
  const [maxFrames, setMaxFrames] = useState(DEFAULT_MAX_FRAMES);

  const [status, setStatus] = useState<Status>("leer");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [analysis, setAnalysis] = useState<FlightAnalysis | null>(null);

  const [edge, setEdge] = useState<CalibrationPoint[]>([]);
  const [tableLengthCm, setTableLengthCm] = useState(TOURNAMENT_TABLE_LENGTH_CM);

  const [view, setView] = useState<View>("vorschau");
  const [overlayIndex, setOverlayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Zählt hoch, sobald ein neues Standbild bereitliegt — damit die Vorschau es aufgreift. */
  const [previewVersion, setPreviewVersion] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  /** Das Standbild für die Vorschau — damit die Marken ohne neuen Sprung im Video neu gezeichnet werden. */
  const previewRef = useRef<ImageData | null>(null);
  const cancelRef = useRef(false);
  const playRef = useRef(false);
  /** Sprünge im Video laufen nacheinander; zwei gleichzeitig ergeben ein zufälliges Bild. */
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const analysisRef = useRef<FlightAnalysis | null>(null);

  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);

  useEffect(() => {
    const url = objectUrlRef;
    return () => {
      playRef.current = false;
      cancelRef.current = true;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  const calibration: TableCalibration | null =
    size && edge.length === 2
      ? {
          edgeStart: edge[0],
          edgeEnd: edge[1],
          tableLengthCm,
          // Markiert wird im ausgewerteten Bild — also genau in der Breite, in
          // der auch gerechnet wird.
          referenceWidth: size.width,
        }
      : null;
  const edgeLength = edge.length === 2 ? Math.hypot(edge[1].x - edge[0].x, edge[1].y - edge[0].y) : 0;
  const edgeTooShort = edge.length === 2 && edgeLength < defaultFlightSettings.minCalibrationSpan;

  const settings: FlightSettings = {
    ...defaultFlightSettings,
    fps,
    calibration,
  };
  const summary = analysis ? summarize(analysis) : null;
  const calibrated = analysis?.scale != null;

  /** Standbild plus die gesetzten Marken der Tischkante. */
  const paintPreview = useCallback((points: readonly CalibrationPoint[]) => {
    const canvas = canvasRef.current;
    const image = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image) return;

    ctx.putImageData(image, 0, 0);
    if (points.length === 2) {
      ctx.strokeStyle = "#e879f9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
    }
    points.forEach((point, index) => {
      ctx.fillStyle = "#e879f9";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0b0b0b";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), point.x, point.y);
    });
  }, []);

  // Die Vorschau wird aus dem Zustand heraus gezeichnet und nicht aus jedem
  // Klick heraus: Sonst müsste jede Stelle, die eine Marke ändert, ans Zeichnen
  // denken — und eine davon würde es vergessen.
  useEffect(() => {
    if (view === "vorschau") paintPreview(edge);
  }, [edge, view, previewVersion, paintPreview]);

  /** Ein Bild der Aufnahme mit den Markierungen der Auswertung darüber. */
  const drawOverlayFrame = useCallback(
    async (index: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d", { willReadFrequently: true });
      const current = analysisRef.current;
      if (!video || !canvas || !ctx || !current) return;
      const result = current.frames[index];
      if (!result) return;

      await seekTo(video, sampleTime(index, fps));
      const image = grabImage(video, ctx, canvas.width, canvas.height);
      // `paintOverlay` malt in dieselben Daten, die gleich zurück auf das Canvas
      // gehen — der Kern selbst rührt kein Bild an.
      paintOverlay(toFlightFrame(image), result, current.throws);
      ctx.putImageData(image, 0, 0);
    },
    [fps],
  );

  /** Sprünge im Video hintereinander abarbeiten statt durcheinander. */
  const queueOverlay = useCallback(
    (index: number) => {
      const next = chainRef.current.then(() => drawOverlayFrame(index)).catch(() => undefined);
      chainRef.current = next;
      return next;
    },
    [drawOverlayFrame],
  );

  function showFrame(index: number) {
    setOverlayIndex(index);
    void queueOverlay(index);
  }

  async function handleFile(file: File) {
    playRef.current = false;
    setPlaying(false);
    cancelRef.current = true;
    setAnalysis(null);
    setMessage(null);
    setEdge([]);
    setView("vorschau");
    setOverlayIndex(0);
    setFileName(file.name);

    const video = videoRef.current;
    if (!video) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    video.src = url;

    try {
      await waitForMetadata(video);
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        throw new Error(
          "Die Länge dieser Datei lässt sich im Browser nicht bestimmen. " +
            "Eine Datei mit vollständigem Kopf wählen (MP4 aus der Kamera).",
        );
      }
      const next = analysisSize(video.videoWidth, video.videoHeight, ANALYSIS_WIDTH);
      setSize(next);
      setDuration(video.duration);

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = next.width;
      canvas.height = next.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      await seekTo(video, sampleTime(0, fps));
      ctx.drawImage(video, 0, 0, next.width, next.height);
      previewRef.current = ctx.getImageData(0, 0, next.width, next.height);
      setPreviewVersion((version) => version + 1);
      setStatus("bereit");
    } catch (error: unknown) {
      setStatus("fehler");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Die Auswertung: Bild für Bild aus dem Video holen und in denselben
   * Erkennungskern schieben, den auch das Skript benutzt.
   *
   * Zwischen zwei Bildern liegt jedes Mal ein Sprung im Video, auf den gewartet
   * wird — deshalb bleibt die Seite bedienbar, obwohl gerechnet wird.
   */
  async function run() {
    const video = videoRef.current;
    if (!video || !size) return;

    const count = frameCount(duration, fps, maxFrames);
    if (count === 0) {
      setStatus("fehler");
      setMessage("Die Aufnahme enthält keine auswertbaren Bilder.");
      return;
    }

    playRef.current = false;
    setPlaying(false);
    cancelRef.current = false;
    setAnalysis(null);
    setMessage(null);
    setStatus("laeuft");
    setTotal(count);
    setDone(0);
    setView("overlay");

    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const flight = new FlightRun(settings);
    const started = performance.now();
    try {
      for (let index = 0; index < count; index++) {
        if (cancelRef.current) break;
        await seekTo(video, sampleTime(index, fps));
        // Das Bild wird nur durchgereicht und danach fallen gelassen — eine
        // ganze Aufnahme im Speicher wäre ein halbes Gigabyte.
        flight.push(toFlightFrame(grabImage(video, ctx, size.width, size.height)));
        if (index % PROGRESS_EVERY === 0) setDone(index);
      }
    } catch (error: unknown) {
      setStatus("fehler");
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    if (cancelRef.current) {
      setStatus("bereit");
      setView("vorschau");
      setMessage("Abgebrochen. Es wurde nichts ausgewertet.");
      return;
    }

    const result = flight.finish();
    setDone(count);
    setElapsed((performance.now() - started) / 1000);
    setAnalysis(result);
    analysisRef.current = result;
    setStatus("fertig");
    setMessage(
      result.scale
        ? `Kalibrierung: ${zahl(result.scale.tableLengthCm)} cm Tischkante auf ` +
            `${zahl(result.scale.edgeLength, 1)} Bildpunkten — ` +
            `${zahl(result.scale.cmPerPixel, 3)} cm je Bildpunkt.`
        : calibration
          ? "Die Kalibrierung ist unbrauchbar (Punkte zu dicht beieinander). Es wird in Bildpunkten gerechnet."
          : "Ohne Kalibrierung — alle Kennzahlen stehen in Bildpunkten.",
    );
    showFrame(result.throws[0]?.endFrame ?? 0);
  }

  /** Das Overlay durchlaufen lassen — so schnell, wie das Video die Bilder hergibt. */
  async function play() {
    const current = analysisRef.current;
    if (!current || playRef.current) return;
    playRef.current = true;
    setPlaying(true);
    let index = overlayIndex >= current.frames.length - 1 ? 0 : overlayIndex;
    while (playRef.current && index < current.frames.length - 1) {
      index++;
      setOverlayIndex(index);
      await queueOverlay(index);
    }
    playRef.current = false;
    setPlaying(false);
  }

  function stop() {
    playRef.current = false;
    setPlaying(false);
  }

  function handleCanvasClick(event: React.PointerEvent<HTMLCanvasElement>) {
    if (view !== "vorschau" || status === "laeuft") return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    // Das Canvas wird im Fenster größer oder kleiner dargestellt, gerechnet wird
    // aber in seinen eigenen Bildpunkten — und das sind genau die des
    // ausgewerteten Bildes.
    const point: CalibrationPoint = {
      x: Math.round(((event.clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((event.clientY - rect.top) / rect.height) * canvas.height),
    };
    // Aus dem vorherigen Stand heraus, nicht aus dem des letzten Bildaufbaus:
    // Zwei schnelle Klicks nacheinander würden sonst denselben Stand sehen, und
    // der zweite Punkt träte an die Stelle des ersten.
    setEdge((previous) => (previous.length >= 2 ? [point] : [...previous, point]));
  }

  function toPreview() {
    stop();
    setView("vorschau");
  }

  function toOverlay() {
    setView("overlay");
    showFrame(overlayIndex);
  }

  const busy = status === "laeuft";
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Nur zum Bilderholen da — gesehen wird das Canvas darunter. */}
      <video
        ref={videoRef}
        preload="auto"
        muted
        playsInline
        className="pointer-events-none absolute h-px w-px opacity-0"
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Aufnahme</CardTitle>
          <CardDescription>
            {fileName
              ? `${fileName}${size ? ` · ausgewertet wird ${size.width}×${size.height}` : ""}${
                  duration > 0 ? ` · ${sekunden(duration, 1)}` : ""
                }`
              : "Die Datei bleibt auf diesem Rechner — sie wird weder hochgeladen noch gespeichert."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
              Videodatei wählen
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <Button disabled={status === "leer" || status === "fehler" || busy} onClick={() => void run()}>
              Auswerten
            </Button>
            {busy && (
              <Button variant="outline" onClick={() => (cancelRef.current = true)}>
                Abbrechen
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span>Bilder pro Sekunde</span>
              <input
                type="number"
                min={1}
                max={240}
                step={1}
                value={fps}
                disabled={busy}
                onChange={(event) => setFps(Math.max(1, Number(event.target.value) || 1))}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 tabular-nums"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Höchstzahl der Bilder</span>
              <input
                type="number"
                min={1}
                max={20000}
                step={100}
                value={maxFrames}
                disabled={busy}
                onChange={(event) => setMaxFrames(Math.max(1, Number(event.target.value) || 1))}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 tabular-nums"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Der Browser kennt die Bildrate einer Datei nicht — sie muss hier stehen. Bei einer Aufnahme mit 60
            Bildern pro Sekunde also 60 eintragen, sonst stimmen alle Zeitpunkte nicht.
            {duration > 0 && ` Auszuwerten wären ${frameCount(duration, fps, maxFrames)} Bilder.`} Die
            Auswertung dauert ein Vielfaches der Spieldauer, weil jedes Bild einzeln aus dem Video geholt
            wird; die Seite bleibt dabei bedienbar und lässt sich jederzeit abbrechen.
          </p>

          {busy && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${percent}%` }} />
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                Bild {done} von {total} · {percent} %
              </p>
            </div>
          )}
          {message && (
            <p className={`text-sm ${status === "fehler" ? "text-destructive" : "text-muted-foreground"}`}>
              {message}
            </p>
          )}
        </CardContent>
      </Card>

      {/*
        Das Canvas bleibt immer im Baum, auch wenn noch keine Datei gewählt ist:
        Das erste Standbild wird darauf gezeichnet, bevor die Seite etwas
        anzuzeigen hat — gäbe es das Canvas erst danach, käme es nie dazu.
      */}
      <div hidden={status === "leer" || status === "fehler"} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={view === "vorschau" ? "default" : "outline"} onClick={toPreview}>
            Kalibrieren
          </Button>
          <Button
            size="sm"
            variant={view === "overlay" ? "default" : "outline"}
            disabled={!analysis}
            onClick={toOverlay}
          >
            Overlay
          </Button>
          {view === "overlay" && analysis && (
            <>
              <Button size="sm" variant="ghost" onClick={() => (playing ? stop() : void play())}>
                {playing ? "Anhalten" : "Abspielen"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={overlayIndex <= 0}
                onClick={() => showFrame(overlayIndex - 1)}
              >
                ◀ Bild
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={overlayIndex >= analysis.frames.length - 1}
                onClick={() => showFrame(overlayIndex + 1)}
              >
                Bild ▶
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Bild {overlayIndex} · {sekunden(overlayIndex / fps)}
              </span>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10">
          <canvas
            ref={canvasRef}
            onPointerDown={handleCanvasClick}
            className={`block h-auto w-full ${view === "vorschau" && !busy ? "cursor-crosshair" : ""}`}
          />
        </div>

        {view === "overlay" && analysis && analysis.frames.length > 1 && (
          <input
            type="range"
            min={0}
            max={analysis.frames.length - 1}
            step={1}
            value={overlayIndex}
            onChange={(event) => showFrame(Number(event.target.value))}
            className="w-full accent-emerald-500"
          />
        )}
      </div>

      {view === "vorschau" && status !== "leer" && status !== "fehler" && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Kalibrierung · freiwillig</CardTitle>
            <CardDescription>
              Zwei Punkte auf der vorderen Tischkante anklicken und die Länge dazwischen eintragen. Ohne
              Kalibrierung stehen alle Kennzahlen in Bildpunkten — die erkannten Würfe bleiben dieselben.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block space-y-1 text-sm">
                <span>Tischlänge in Zentimetern</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={tableLengthCm}
                  disabled={busy}
                  onChange={(event) => setTableLengthCm(Math.max(1, Number(event.target.value) || 1))}
                  className="h-9 w-32 rounded-lg border border-input bg-background px-2 tabular-nums"
                />
              </label>
              <Button variant="ghost" size="sm" disabled={!edge.length} onClick={() => setEdge([])}>
                Marken löschen
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {edge.length === 0
                ? "Ersten Punkt im Bild anklicken."
                : edge.length === 1
                  ? "Zweiten Punkt auf derselben Kante anklicken."
                  : edgeTooShort
                    ? `Die Punkte liegen nur ${zahl(edgeLength)} Bildpunkte auseinander — das ist zu wenig für einen brauchbaren Maßstab. Bitte die ganze Kante markieren.`
                    : `Kante: ${zahl(edgeLength, 1)} Bildpunkte für ${zahl(tableLengthCm)} cm — ${zahl(tableLengthCm / edgeLength, 3)} cm je Bildpunkt.`}
            </p>
            {calibration && !edgeTooShort && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Dieselbe Kalibrierung für das Skript</summary>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-foreground">
                  {JSON.stringify(calibration, null, 2)}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {analysis && summary && (
        <>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Würfe · {summary.throws}</CardTitle>
              <CardDescription>
                {summary.throwsLeft} von links · {summary.throwsRight} von rechts · {summary.bounces}{" "}
                Aufsetzer
                {!calibrated && summary.throws > 0 && " (ohne Kalibrierung allein aus der Form der Bahn)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.throws === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Kein Wurf erkannt. Die Aufnahme sollte mit ein paar Sekunden leerem Tisch beginnen — daraus
                  lernt der Kern den Hintergrund.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Nr</th>
                        <th className="py-1 pr-3 font-medium">Abwurf</th>
                        <th className="py-1 pr-3 font-medium">Dauer</th>
                        <th className="py-1 pr-3 font-medium">Seite</th>
                        <th className="py-1 pr-3 font-medium">Scheitel</th>
                        <th className="py-1 pr-3 font-medium">Weite</th>
                        <th className="py-1 pr-3 font-medium">Tempo</th>
                        <th className="py-1 font-medium">Art</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {analysis.throws.map((found) => (
                        <tr
                          key={found.nr}
                          onClick={() => {
                            stop();
                            setView("overlay");
                            showFrame(found.endFrame);
                          }}
                          className="cursor-pointer border-t hover:bg-muted"
                        >
                          <td className="py-1 pr-3">{found.nr}</td>
                          <td className="py-1 pr-3">{sekunden(found.startedAt)}</td>
                          <td className="py-1 pr-3">{sekunden(found.metrics.duration)}</td>
                          <td className="py-1 pr-3">{found.side}</td>
                          <td className="py-1 pr-3">{peak(found, calibrated)}</td>
                          <td className="py-1 pr-3">{span(found, calibrated)}</td>
                          <td className="py-1 pr-3">{speed(found, calibrated)}</td>
                          <td className="py-1 whitespace-nowrap">
                            {found.bounce ? (
                              <span className="text-fuchsia-400">
                                Aufsetzer
                                {found.bouncePoint && ` · ${sekunden(found.bouncePoint.at, 3)}`}
                              </span>
                            ) : (
                              "direkt"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Eine Zeile anklicken zeigt den Wurf im Overlay.</p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Auswertung</CardTitle>
              <CardDescription>
                {summary.frames} Bilder in {sekunden(elapsed, 1)} — dieselben Zahlen wie bei{" "}
                <code>npm run analyse</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm tabular-nums">
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Bilder ausgewertet</span>
                  <span>{summary.frames}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Bilder Lernphase</span>
                  <span>{summary.learningFrames}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Ball-Kandidaten</span>
                  <span>
                    {summary.candidates} in {summary.framesWithCandidates} Bildern
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Szenenwechsel</span>
                  <span>{summary.sceneChanges}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function peak(found: Throw, calibrated: boolean): string {
  const { peakHeight, peakHeightCm } = found.metrics;
  return calibrated && peakHeightCm !== undefined ? `${zahl(peakHeightCm)} cm` : `${zahl(peakHeight)} px`;
}

function span(found: Throw, calibrated: boolean): string {
  const { span: spanPx, spanCm } = found.metrics;
  return calibrated && spanCm !== undefined ? `${zahl(spanCm)} cm` : `${zahl(spanPx)} px`;
}

function speed(found: Throw, calibrated: boolean): string {
  const { speed: speedPx, speedMps } = found.metrics;
  return calibrated && speedMps !== undefined ? `${zahl(speedMps, 1)} m/s` : `${zahl(speedPx)} px/s`;
}
