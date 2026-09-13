// Browser-Helfer für Kamera, Wake Lock und Sprachausgabe (iPhone-Safari-tauglich).

export interface CapabilityRow {
  name: string;
  label: string;
  current: string;
  possible: string;
}

export interface RangeCapability {
  min: number;
  max: number;
}

const interestingCapabilities: Array<[name: string, label: string]> = [
  ["width", "Breite"],
  ["height", "Höhe"],
  ["frameRate", "Bildrate"],
  ["facingMode", "Kamera"],
  ["zoom", "Zoom"],
  ["exposureMode", "Belichtung"],
  ["exposureCompensation", "Belichtungskorrektur"],
  ["exposureTime", "Belichtungszeit"],
  ["iso", "ISO"],
  ["whiteBalanceMode", "Weißabgleich"],
  ["colorTemperature", "Farbtemperatur"],
  ["focusMode", "Fokus"],
  ["focusDistance", "Fokusdistanz"],
  ["torch", "Licht"],
];

function capabilitiesOf(track: MediaStreamTrack): Record<string, unknown> {
  return (typeof track.getCapabilities === "function" ? track.getCapabilities() : {}) as Record<string, unknown>;
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "–";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "–";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (typeof value === "object") {
    const { min, max } = value as { min?: unknown; max?: unknown };
    const hasMin = typeof min === "number";
    const hasMax = typeof max === "number";
    if (hasMin && hasMax) return `${formatValue(min)}–${formatValue(max)}`;
    if (hasMin) return `ab ${formatValue(min)}`;
    if (hasMax) return `bis ${formatValue(max)}`;
    return "–";
  }
  return String(value);
}

/** Zeigt, welche Kamera-Einstellungen der Browser freigibt. */
export function describeTrack(track: MediaStreamTrack): CapabilityRow[] {
  const capabilities = capabilitiesOf(track);
  const settings = track.getSettings() as Record<string, unknown>;
  return interestingCapabilities.map(([name, label]) => ({
    name,
    label,
    current: formatValue(settings[name]),
    possible: name in capabilities ? formatValue(capabilities[name]) : "nicht steuerbar",
  }));
}

export function deviceLabel(device: MediaDeviceInfo, index: number): string {
  const label = device.label || `Kamera ${index + 1}`;
  return /triple|dual/i.test(label) ? `${label} (Zoom 0,5 = Ultraweitwinkel)` : label;
}

export function zoomRange(track: MediaStreamTrack): RangeCapability | null {
  const zoom = capabilitiesOf(track).zoom as { min?: unknown; max?: unknown } | undefined;
  if (!zoom || typeof zoom.min !== "number" || typeof zoom.max !== "number") return null;
  return { min: zoom.min, max: zoom.max };
}

export function supportsTorch(track: MediaStreamTrack): boolean {
  const torch = capabilitiesOf(track).torch;
  return torch === true || (Array.isArray(torch) && torch.includes(true));
}

function supportsManual(track: MediaStreamTrack, key: string): boolean {
  const modes = capabilitiesOf(track)[key];
  return Array.isArray(modes) && modes.includes("manual");
}

export async function applyAdvanced(track: MediaStreamTrack, constraint: Record<string, unknown>): Promise<boolean> {
  try {
    await track.applyConstraints({ advanced: [constraint] } as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}

/** Setzt den Weißabgleich fest, damit Farben nicht mit dem Licht wandern. */
export async function lockWhiteBalance(track: MediaStreamTrack): Promise<boolean> {
  if (!supportsManual(track, "whiteBalanceMode")) return false;
  return applyAdvanced(track, { whiteBalanceMode: "manual" });
}

/** Versucht Belichtung, Weißabgleich und Fokus festzusetzen. */
export async function lockTrack(track: MediaStreamTrack): Promise<string> {
  const candidates: Array<[key: string, label: string]> = [
    ["exposureMode", "Belichtung"],
    ["whiteBalanceMode", "Weißabgleich"],
    ["focusMode", "Fokus"],
  ];
  const supported = candidates.filter(([key]) => supportsManual(track, key));
  if (!supported.length) return "Dieses Gerät erlaubt im Browser keine Sperre.";

  const advanced = supported.map(([key]) => ({ [key]: "manual" }));
  try {
    await track.applyConstraints({ advanced } as MediaTrackConstraints);
    return `Gesperrt: ${supported.map(([, label]) => label).join(", ")}`;
  } catch {
    return "Sperren fehlgeschlagen.";
  }
}

export function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
        return "Kamerazugriff verweigert. In Safari: „aA“ → Website-Einstellungen → Kamera erlauben.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "Keine passende Kamera gefunden.";
      case "NotReadableError":
        return "Die Kamera wird gerade von einer anderen App benutzt.";
    }
  }
  return "Kamera konnte nicht gestartet werden.";
}

export async function acquireWakeLock(ref: { current: WakeLockSentinel | null }): Promise<void> {
  try {
    if ("wakeLock" in navigator) ref.current = await navigator.wakeLock.request("screen");
  } catch {
    // z. B. Energiesparmodus — dann bleibt das Display eben nicht dauerhaft an.
  }
}

export function stopMedia(
  streamRef: { current: MediaStream | null },
  objectUrlRef: { current: string | null },
): void {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
  if (objectUrlRef.current) {
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }
}

/** Kleines JPEG-Vorschaubild des aktuellen Videobilds als Data-URL. */
export function capturePreview(video: HTMLVideoElement, canvas: HTMLCanvasElement, width: number): string | null {
  if (video.readyState < 2 || !video.videoWidth) return null;
  const height = Math.round((width * video.videoHeight) / video.videoWidth);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.6);
}

export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 1.1;
  window.speechSynthesis.speak(utterance);
}
