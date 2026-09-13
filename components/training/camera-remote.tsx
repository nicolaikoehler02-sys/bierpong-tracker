"use client";

import { useEffect, useRef, useState } from "react";
import { sendCameraCommand, sendRemoteSettings } from "@/app/training/camera-actions";
import { RangeInput } from "@/components/range-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CameraSettings, CameraStateResponse } from "@/lib/camera-types";
import { type ColorParams, defaultColorParams } from "@/lib/detection/color";
import { drawOverlay } from "@/lib/detection/overlay";

const POLL_MS = 1500;
const FETCH_TIMEOUT_MS = 8000;
const ONLINE_WINDOW_MS = 10_000;
/** So lange nach einer Änderung am Laptop werden Meldungen vom iPhone nicht in die Regler übernommen. */
const EDIT_GRACE_MS = 4000;
const SEND_DEBOUNCE_MS = 300;
const MAX_ZOOM = 3;
const percent = (value: number) => `${Math.round(value * 100)} %`;

/** Steuert die Kamera-Seite auf dem iPhone vom Laptop aus. */
export function CameraRemote() {
  const [open, setOpen] = useState(true);
  const [camera, setCamera] = useState<CameraStateResponse | null>(null);
  const [draft, setDraft] = useState<CameraSettings | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const lastEditRef = useRef(0);
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Nur solange die Karte offen ist, abfragen — dann schickt das iPhone auch Vorschaubilder.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch("/api/camera/state", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as CameraStateResponse;
        if (!cancelled) {
          setCamera(data);
          setConnectionError(false);
          if (data.settings && Date.now() - lastEditRef.current > EDIT_GRACE_MS) setDraft(data.settings);
        }
      } catch {
        if (!cancelled) setConnectionError(true);
      } finally {
        clearTimeout(timeout);
        if (!cancelled) timer = setTimeout(poll, POLL_MS);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    const timerRef = sendTimerRef;
    return () => clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!draft) return;
    drawOverlay(
      overlayRef.current,
      draft.cups,
      draft.radius,
      camera?.status
        ? { cups: camera.status.readings, hits: [], sceneChanged: camera.status.sceneChanged ?? false }
        : null,
    );
  }, [draft, camera]);

  function change(patch: Partial<CameraSettings>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    lastEditRef.current = Date.now();
    clearTimeout(sendTimerRef.current);
    sendTimerRef.current = setTimeout(() => {
      void sendRemoteSettings(next).then((result) => setMessage(result.ok ? null : result.error));
    }, SEND_DEBOUNCE_MS);
  }

  function changeColor(key: keyof ColorParams, value: number) {
    if (draft) change({ color: { ...draft.color, [key]: value } });
  }

  function handlePointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!draft || draft.mode !== "calibrate") return;
    const rect = event.currentTarget.getBoundingClientRect();
    change({
      cups: [...draft.cups, { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }],
    });
  }

  async function captureReference() {
    const result = await sendCameraCommand("capture_reference");
    setMessage(result.ok ? "Leer-Referenz angefordert …" : result.error);
  }

  const online = camera?.reportAgeMs != null && camera.reportAgeMs < ONLINE_WINDOW_MS;
  const status = camera?.status ?? null;

  const description = !open
    ? "Eingeklappt, keine Vorschaubilder."
    : !camera
      ? "Lade …"
      : !online
        ? "iPhone nicht verbunden. Auf dem iPhone „Kamera“ öffnen."
        : !status?.running
          ? "iPhone verbunden, Kamera aus. Am iPhone einmal „Kamera starten“ tippen."
          : status.trackState === "muted" || status.trackState === "ended"
            ? "Kamera am iPhone unterbrochen (Display gesperrt?). Am iPhone „Kamera neu starten“ tippen."
            : `${status.fps} Analysen pro Sekunde · Referenz ${status.hasReference ? "vorhanden" : "fehlt"}${
                status.sceneChanged ? " · ⚠ Bild stark verändert, Leer-Referenz neu aufnehmen" : ""
              }${status.referenceMessage && !status.sceneChanged ? ` · ${status.referenceMessage}` : ""}`;

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Kamera-Fernbedienung</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
            {open ? "Einklappen" : "Ausklappen"}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {connectionError && <p className="text-sm text-destructive">Keine Verbindung zum Server.</p>}
          {message && <p className="text-sm text-muted-foreground">{message}</p>}

          {online && camera?.preview ? (
            <div className="relative mx-auto w-fit overflow-hidden rounded-lg bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element -- Vorschaubild kommt als Data-URL vom iPhone */}
              <img src={camera.preview} alt="Vorschaubild der iPhone-Kamera" className="block max-h-[60vh] w-auto" />
              <canvas
                ref={overlayRef}
                onPointerDown={handlePointer}
                className={`absolute inset-0 h-full w-full touch-none ${draft?.mode === "calibrate" ? "cursor-crosshair" : ""}`}
              />
            </div>
          ) : (
            online && status?.running && <p className="text-sm text-muted-foreground">Warte auf Vorschaubild …</p>
          )}

          {online && draft && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant={draft.mode === "calibrate" ? "default" : "outline"} onClick={() => change({ mode: "calibrate" })}>
                    Kalibrieren
                  </Button>
                  <Button variant={draft.mode === "detect" ? "default" : "outline"} onClick={() => change({ mode: "detect" })}>
                    Erkennen
                  </Button>
                  <Button variant="ghost" disabled={!draft.cups.length} onClick={() => change({ cups: draft.cups.slice(0, -1) })}>
                    Rückgängig
                  </Button>
                  <Button variant="ghost" disabled={!draft.cups.length} onClick={() => change({ cups: [] })}>
                    Alle löschen
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {draft.cups.length} Becher ·{" "}
                  {draft.mode === "calibrate" ? "Im Vorschaubild auf die Bechermitten klicken." : "Erkennung läuft."}
                </p>
                <Button
                  variant="secondary"
                  disabled={!status?.running || !draft.cups.length}
                  onClick={() => void captureReference()}
                >
                  Leer-Referenz aufnehmen
                </Button>
                <RangeInput
                  label="Becherradius"
                  value={draft.radius}
                  min={0.015}
                  max={0.15}
                  step={0.0025}
                  format={(value) => `${(value * 100).toFixed(1)} %`}
                  onChange={(radius) => change({ radius })}
                />
                {status?.zoomRange && (
                  <RangeInput
                    label="Zoom"
                    value={draft.zoom}
                    min={status.zoomRange.min}
                    max={Math.min(status.zoomRange.max, MAX_ZOOM)}
                    step={0.05}
                    format={(value) => `${value.toFixed(2).replace(".", ",")}×`}
                    onChange={(zoom) => change({ zoom })}
                  />
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {status?.torchAvailable && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={draft.torch} onChange={(event) => change({ torch: event.target.checked })} />
                      Licht
                    </label>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.voice} onChange={(event) => change({ voice: event.target.checked })} />
                    Treffer ansagen
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.sendHits}
                      onChange={(event) => change({ sendHits: event.target.checked })}
                    />
                    Treffer senden
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <RangeInput
                  label="Schwelle (Ballfleck)"
                  value={draft.threshold}
                  min={0.01}
                  max={0.4}
                  step={0.01}
                  format={percent}
                  onChange={(threshold) => change({ threshold })}
                />
                <RangeInput
                  label="Stabile Frames"
                  value={draft.framesOn}
                  min={2}
                  max={15}
                  step={1}
                  onChange={(framesOn) => change({ framesOn })}
                />
                <RangeInput
                  label="Hand-Sperre ab Randänderung"
                  value={draft.handThreshold}
                  min={0.05}
                  max={0.8}
                  step={0.05}
                  format={percent}
                  onChange={(handThreshold) => change({ handThreshold })}
                />
                <p className="text-xs text-muted-foreground">Hand-Sperre: höherer Wert = unempfindlicher. Standard 25 %.</p>
                {status && status.readings.length > 0 && (
                  <ul className="space-y-0.5 text-xs tabular-nums text-muted-foreground">
                    {status.readings.map((reading, index) => (
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
              </div>

              <details className="sm:col-span-2">
                <summary className="cursor-pointer text-sm font-medium">Farben feinjustieren</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <RangeInput label="Weiß: max. Sättigung" value={draft.color.whiteMaxSat} min={0.05} max={0.5} step={0.01} format={percent} onChange={(v) => changeColor("whiteMaxSat", v)} />
                  <RangeInput label="Weiß: min. Helligkeit" value={draft.color.whiteMinVal} min={0.3} max={1} step={0.01} format={percent} onChange={(v) => changeColor("whiteMinVal", v)} />
                  <RangeInput label="Orange: Farbton ab" value={draft.color.orangeHueMin} min={0} max={60} step={1} format={(v) => `${v}°`} onChange={(v) => changeColor("orangeHueMin", v)} />
                  <RangeInput label="Orange: Farbton bis" value={draft.color.orangeHueMax} min={10} max={80} step={1} format={(v) => `${v}°`} onChange={(v) => changeColor("orangeHueMax", v)} />
                  <RangeInput label="Orange: min. Sättigung" value={draft.color.orangeMinSat} min={0.1} max={1} step={0.01} format={percent} onChange={(v) => changeColor("orangeMinSat", v)} />
                  <RangeInput label="Orange: min. Helligkeit" value={draft.color.orangeMinVal} min={0.1} max={1} step={0.01} format={percent} onChange={(v) => changeColor("orangeMinVal", v)} />
                  <RangeInput label="Mindest-Änderung zur Referenz" value={draft.color.minChange} min={0} max={200} step={5} onChange={(v) => changeColor("minChange", v)} />
                  <div className="flex items-end">
                    <Button variant="outline" onClick={() => change({ color: defaultColorParams })}>
                      Farben zurücksetzen
                    </Button>
                  </div>
                </div>
              </details>

              <p className="text-xs text-muted-foreground sm:col-span-2">
                Kamera starten und die erste Sprachansage gehen nur direkt am iPhone (Safari-Regel). Änderungen kommen dort
                nach 1–2 Sekunden an.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
