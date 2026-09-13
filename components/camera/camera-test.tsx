"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CapabilityRow,
  type RangeCapability,
  acquireWakeLock,
  applyAdvanced,
  cameraErrorMessage,
  describeTrack,
  deviceLabel,
  lockTrack,
  lockWhiteBalance,
  speak,
  stopMedia,
  supportsTorch,
  zoomRange,
} from "@/lib/camera";
import { type ColorParams, defaultColorParams } from "@/lib/detection/color";
import { type Cup, type CupState, CupDetector, type DetectionParams, type HitEvent } from "@/lib/detection/detector";
import { drawOverlay } from "@/lib/detection/overlay";

const WORK_WIDTH = 320;
const ANALYSIS_INTERVAL_MS = 66;
const UI_INTERVAL_MS = 250;
const FRAMES_OFF = 10;
const MAX_ZOOM = 3;
const STORAGE_KEY = "bierpong-kamera-v2";
const LEGACY_STORAGE_KEY = "bierpong-kamera-v1";

type Status = "idle" | "starting" | "running" | "error";
type Source = "none" | "camera" | "file";
type Mode = "calibrate" | "detect";

interface StoredSettings {
  cups: Cup[];
  radius: number;
  zoom: number;
  threshold: number;
  framesOn: number;
  handThreshold: number;
  color: ColorParams;
}

const defaultSettings: StoredSettings = {
  cups: [],
  radius: 0.045,
  zoom: 1,
  threshold: 0.12,
  framesOn: 5,
  handThreshold: 0.25,
  color: defaultColorParams,
};

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSettings>;
      return { ...defaultSettings, ...parsed, color: { ...defaultColorParams, ...parsed.color } };
    }
    // Aus v1 nur die Kalibrierung übernehmen, damit die neuen Standardwerte greifen.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<StoredSettings>;
      return { ...defaultSettings, cups: parsed.cups ?? [], radius: parsed.radius ?? defaultSettings.radius };
    }
  } catch {
    // Kaputte oder gesperrte Einstellungen — mit Standardwerten weitermachen.
  }
  return defaultSettings;
}

const timeFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const percent = (value: number) => `${Math.round(value * 100)} %`;
const colorLabel = (color: HitEvent["color"]) => (color === "orange" ? "orange" : "weiß");
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function CameraTest() {
  const [initial] = useState(loadSettings);
  const [cups, setCups] = useState<Cup[]>(initial.cups);
  const [radius, setRadius] = useState(initial.radius);
  const [zoom, setZoom] = useState(initial.zoom);
  const [threshold, setThreshold] = useState(initial.threshold);
  const [framesOn, setFramesOn] = useState(initial.framesOn);
  const [handThreshold, setHandThreshold] = useState(initial.handThreshold);
  const [color, setColor] = useState<ColorParams>(initial.color);

  const [status, setStatus] = useState<Status>("idle");
  const [source, setSource] = useState<Source>("none");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([]);
  const [zoomCapability, setZoomCapability] = useState<RangeCapability | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torch, setTorch] = useState(false);
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const [referenceMessage, setReferenceMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("calibrate");
  const [hasReference, setHasReference] = useState(false);
  const [readings, setReadings] = useState<CupState[]>([]);
  const [events, setEvents] = useState<HitEvent[]>([]);
  const [fps, setFps] = useState(0);
  const [voice, setVoice] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(false);
  const referenceRequestedRef = useRef(false);
  const resetRequestedRef = useRef(false);
  const liveRef = useRef({
    cups,
    radius,
    mode,
    voice,
    params: { threshold, framesOn, framesOff: FRAMES_OFF, handThreshold, color } as DetectionParams,
  });

  // Aktuelle Werte für die Analyse-Schleife bereitstellen.
  useEffect(() => {
    liveRef.current = {
      cups,
      radius,
      mode,
      voice,
      params: { threshold, framesOn, framesOff: FRAMES_OFF, handThreshold, color },
    };
  }, [cups, radius, mode, voice, threshold, framesOn, handThreshold, color]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ cups, radius, zoom, threshold, framesOn, handThreshold, color } satisfies StoredSettings),
      );
    } catch {
      // Privater Modus o. Ä. — Einstellungen gelten dann nur für diese Sitzung.
    }
  }, [cups, radius, zoom, threshold, framesOn, handThreshold, color]);

  // Analyse-Schleife: Frame verkleinern, Becher auswerten, Overlay zeichnen.
  useEffect(() => {
    const detector = new CupDetector();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let handle = 0;
    let lastAnalysis = 0;
    let lastUi = 0;
    let frames = 0;
    let fpsWindowStart = performance.now();

    const tick = (now: number) => {
      handle = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!ctx || !video || video.readyState < 2 || !video.videoWidth) return;
      if (now - lastAnalysis < ANALYSIS_INTERVAL_MS) return;
      lastAnalysis = now;

      const live = liveRef.current;
      const width = WORK_WIDTH;
      const height = Math.round((WORK_WIDTH * video.videoHeight) / video.videoWidth);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const frame = ctx.getImageData(0, 0, width, height);

      if (detector.ensureLayout(live.cups, live.radius, width, height)) setHasReference(false);
      if (resetRequestedRef.current) {
        resetRequestedRef.current = false;
        detector.resetReference();
      }
      if (referenceRequestedRef.current) {
        referenceRequestedRef.current = false;
        detector.captureReference(frame);
        setHasReference(detector.hasReference);
      }

      const result = detector.analyze(frame, live.params, Date.now());
      if (result.hits.length && live.mode === "detect") {
        setEvents((previous) => [...[...result.hits].reverse(), ...previous].slice(0, 30));
        if (live.voice) {
          for (const hit of result.hits) {
            speak(hit.color === "orange" ? `Treffer orange, Becher ${hit.cup + 1}` : `Treffer Becher ${hit.cup + 1}`);
          }
        }
      }
      drawOverlay(overlayRef.current, live.cups, live.radius, result);

      frames++;
      if (now - lastUi >= UI_INTERVAL_MS) {
        setReadings(result.cups);
        setFps(Math.round((frames * 1000) / (now - fpsWindowStart)));
        lastUi = now;
        frames = 0;
        fpsWindowStart = now;
      }
    };

    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  // Display wach halten; nach dem Zurückkehren in den Tab neu anfordern.
  useEffect(() => {
    const wakeLock = wakeLockRef;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeRef.current) void acquireWakeLock(wakeLock);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopMedia(streamRef, objectUrlRef);
      void wakeLock.current?.release();
    };
  }, []);

  const currentTrack = () => streamRef.current?.getVideoTracks()[0] ?? null;

  /** Bild hat sich verändert (Zoom, Licht, Kamera) — Referenz passt nicht mehr. */
  function invalidateReference() {
    resetRequestedRef.current = true;
    setHasReference(false);
    setReferenceMessage(null);
  }

  async function startCamera(nextDeviceId?: string) {
    setError(null);
    setLockMessage(null);
    // Muss direkt in der Nutzeraktion passieren, sonst bleibt Safari stumm.
    if (voice) speak("Kamera startet");

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("Kamera nicht verfügbar. Die Seite muss über HTTPS laufen.");
      return;
    }

    setStatus("starting");
    stopMedia(streamRef, objectUrlRef);
    invalidateReference();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          ...(nextDeviceId ? { deviceId: { exact: nextDeviceId } } : { facingMode: { ideal: "environment" } }),
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.removeAttribute("src");
      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const range = zoomRange(track);
      setZoomCapability(range);
      if (range) {
        const target = clamp(zoom, range.min, Math.min(range.max, MAX_ZOOM));
        if (await applyAdvanced(track, { zoom: target })) setZoom(target);
      }
      setTorchAvailable(supportsTorch(track));
      setTorch(false);
      setCapabilities(describeTrack(track));
      setDeviceId(track.getSettings().deviceId ?? "");
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(allDevices.filter((device) => device.kind === "videoinput"));

      activeRef.current = true;
      setSource("camera");
      setStatus("running");
      void acquireWakeLock(wakeLockRef);
    } catch (err) {
      setStatus("error");
      setError(cameraErrorMessage(err));
    }
  }

  function loadVideoFile(file: File) {
    const video = videoRef.current;
    if (!video) return;
    stopMedia(streamRef, objectUrlRef);
    invalidateReference();
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    video.srcObject = null;
    video.src = url;
    video.loop = true;
    video.muted = true;
    void video.play();

    activeRef.current = true;
    setCapabilities([]);
    setDevices([]);
    setZoomCapability(null);
    setTorchAvailable(false);
    setLockMessage(null);
    setError(null);
    setSource("file");
    setStatus("running");
  }

  function changeCups(next: Cup[]) {
    setCups(next);
    setHasReference(false);
    setReferenceMessage(null);
  }

  function changeRadius(next: number) {
    setRadius(next);
    setHasReference(false);
    setReferenceMessage(null);
  }

  function changeZoom(next: number) {
    setZoom(next);
    invalidateReference();
    const track = currentTrack();
    if (track) void applyAdvanced(track, { zoom: next });
  }

  async function toggleTorch(next: boolean) {
    const track = currentTrack();
    if (!track) return;
    if (await applyAdvanced(track, { torch: next })) {
      setTorch(next);
      invalidateReference();
    }
  }

  async function handleCaptureReference() {
    const track = source === "camera" ? currentTrack() : null;
    let message = "Referenz aufgenommen.";
    if (track) {
      const locked = await lockWhiteBalance(track);
      message = locked
        ? "Referenz aufgenommen, Weißabgleich festgesetzt."
        : "Referenz aufgenommen. Weißabgleich ließ sich nicht festsetzen.";
      setCapabilities(describeTrack(track));
    }
    referenceRequestedRef.current = true;
    setReferenceMessage(message);
  }

  function handleOverlayPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "calibrate" || status !== "running") return;
    const rect = event.currentTarget.getBoundingClientRect();
    changeCups([
      ...cups,
      { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height },
    ]);
  }

  async function handleLock() {
    const track = currentTrack();
    if (!track) return;
    setLockMessage(await lockTrack(track));
    setCapabilities(describeTrack(track));
  }

  const updateColor = (key: keyof ColorParams) => (value: number) =>
    setColor((previous) => ({ ...previous, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={status === "running" || status === "starting" ? "block h-auto w-full" : "hidden"}
        />
        {(status === "idle" || status === "error") && (
          <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Kamera noch nicht gestartet
          </div>
        )}
        <canvas
          ref={overlayRef}
          onPointerDown={handleOverlayPointer}
          className={`absolute inset-0 h-full w-full touch-none ${mode === "calibrate" ? "cursor-crosshair" : ""}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Quelle</CardTitle>
            <CardDescription>
              {status === "running" ? `${fps} Analysen pro Sekunde` : status === "starting" ? "Startet …" : "Bereit"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" onClick={() => void startCamera()}>
                {source === "camera" ? "Kamera neu starten" : "Kamera starten"}
              </Button>
              <label className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
                Testvideo laden
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) loadVideoFile(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            {devices.length > 1 && (
              <select
                value={deviceId}
                onChange={(event) => void startCamera(event.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              >
                {devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {deviceLabel(device, index)}
                  </option>
                ))}
              </select>
            )}
            {zoomCapability && (
              <RangeInput
                label="Zoom"
                value={zoom}
                min={zoomCapability.min}
                max={Math.min(zoomCapability.max, MAX_ZOOM)}
                step={0.05}
                format={(value) => `${value.toFixed(2).replace(".", ",")}×`}
                onChange={changeZoom}
              />
            )}
            {torchAvailable && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={torch} onChange={(event) => void toggleTorch(event.target.checked)} />
                Licht
              </label>
            )}
            {(zoomCapability || torchAvailable) && (
              <p className="text-xs text-muted-foreground">
                Zoom oder Licht ändern verwirft die Referenz. Nach einer Zoom-Änderung Becher neu antippen.
              </p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Becher · {cups.length}</CardTitle>
            <CardDescription>
              {mode === "calibrate"
                ? "Im Bild auf die Mitte jedes Bechers tippen."
                : hasReference
                  ? "Erkennung aktiv."
                  : "Erst Leer-Referenz aufnehmen."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant={mode === "calibrate" ? "default" : "outline"} onClick={() => setMode("calibrate")}>
                Kalibrieren
              </Button>
              <Button variant={mode === "detect" ? "default" : "outline"} onClick={() => setMode("detect")}>
                Erkennen
              </Button>
              <Button variant="ghost" disabled={!cups.length} onClick={() => changeCups(cups.slice(0, -1))}>
                Rückgängig
              </Button>
              <Button variant="ghost" disabled={!cups.length} onClick={() => changeCups([])}>
                Alle löschen
              </Button>
            </div>
            <RangeInput
              label="Becherradius"
              value={radius}
              min={0.015}
              max={0.15}
              step={0.0025}
              format={(value) => `${(value * 100).toFixed(1)} %`}
              onChange={changeRadius}
            />
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Erkennung</CardTitle>
            <CardDescription>
              {hasReference ? "Referenz vorhanden." : "Keine Referenz. Alle Becher leer, keine Hand im Bild."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="secondary"
              disabled={status !== "running" || !cups.length}
              onClick={() => void handleCaptureReference()}
            >
              Leer-Referenz aufnehmen
            </Button>
            {referenceMessage && <p className="text-xs text-muted-foreground">{referenceMessage}</p>}
            <RangeInput label="Schwelle" value={threshold} min={0.01} max={0.4} step={0.01} format={percent} onChange={setThreshold} />
            <RangeInput label="Stabile Frames" value={framesOn} min={2} max={15} step={1} onChange={setFramesOn} />
            <RangeInput
              label="Hand-Sperre ab Randänderung"
              value={handThreshold}
              min={0.05}
              max={0.8}
              step={0.05}
              format={percent}
              onChange={setHandThreshold}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={voice} onChange={(event) => setVoice(event.target.checked)} />
              Treffer ansagen
            </label>
            {readings.length > 0 && (
              <ul className="space-y-0.5 text-xs tabular-nums text-muted-foreground">
                {readings.map((reading, index) => (
                  <li
                    key={index}
                    className={reading.blocked ? "text-sky-400" : reading.present ? "text-emerald-400" : undefined}
                  >
                    #{index + 1} {reading.blocked && "Hand · "}weiß {percent(reading.white)} · orange{" "}
                    {percent(reading.orange)} · Rand {percent(reading.edgeChange)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Treffer · {events.length}</CardTitle>
            <CardDescription>Nur im Modus „Erkennen“ mit Referenz.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Noch keine Treffer.</p>
            ) : (
              <ul className="space-y-1 text-sm tabular-nums">
                {events.map((hit) => (
                  <li key={`${hit.at}-${hit.cup}-${hit.color}`} className="flex justify-between gap-2">
                    <span>
                      Becher {hit.cup + 1} · {colorLabel(hit.color)}
                    </span>
                    <span className="text-muted-foreground">
                      {percent(hit.confidence)} · {timeFormat.format(hit.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {events.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setEvents([])}>
                Liste leeren
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Farben feinjustieren</CardTitle>
          <CardDescription>Nur nötig, wenn Bälle nicht oder falsch erkannt werden.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <RangeInput label="Weiß: max. Sättigung" value={color.whiteMaxSat} min={0.05} max={0.5} step={0.01} format={percent} onChange={updateColor("whiteMaxSat")} />
          <RangeInput label="Weiß: min. Helligkeit" value={color.whiteMinVal} min={0.3} max={1} step={0.01} format={percent} onChange={updateColor("whiteMinVal")} />
          <RangeInput label="Orange: Farbton ab" value={color.orangeHueMin} min={0} max={60} step={1} format={(v) => `${v}°`} onChange={updateColor("orangeHueMin")} />
          <RangeInput label="Orange: Farbton bis" value={color.orangeHueMax} min={10} max={80} step={1} format={(v) => `${v}°`} onChange={updateColor("orangeHueMax")} />
          <RangeInput label="Orange: min. Sättigung" value={color.orangeMinSat} min={0.1} max={1} step={0.01} format={percent} onChange={updateColor("orangeMinSat")} />
          <RangeInput label="Orange: min. Helligkeit" value={color.orangeMinVal} min={0.1} max={1} step={0.01} format={percent} onChange={updateColor("orangeMinVal")} />
          <RangeInput label="Mindest-Änderung zur Referenz" value={color.minChange} min={0} max={200} step={5} onChange={updateColor("minChange")} />
          <div className="flex items-end">
            <Button variant="outline" onClick={() => setColor(defaultColorParams)}>
              Farben zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Kamera-Fähigkeiten</CardTitle>
          <CardDescription>Was dieser Browser an der Kamera steuern darf.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {capabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Erst Kamera starten.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Einstellung</th>
                    <th className="py-1 pr-3 font-medium">Aktuell</th>
                    <th className="py-1 font-medium">Möglich</th>
                  </tr>
                </thead>
                <tbody>
                  {capabilities.map((row) => (
                    <tr key={row.name} className="border-t">
                      <td className="py-1 pr-3 whitespace-nowrap">{row.label}</td>
                      <td className="py-1 pr-3">{row.current}</td>
                      <td className={`py-1 ${row.possible === "nicht steuerbar" ? "text-muted-foreground" : ""}`}>
                        {row.possible}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={source !== "camera"} onClick={() => void handleLock()}>
              Belichtung &amp; Fokus sperren
            </Button>
            {lockMessage && <span className="text-sm text-muted-foreground">{lockMessage}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RangeInput({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-emerald-500"
      />
    </label>
  );
}
