// Browser-Helfer für Kamera, Wake Lock und Sprachausgabe (iPhone-Safari-tauglich).

export interface CapabilityRow {
  name: string;
  label: string;
  current: string;
  possible: string;
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
    const range = value as { min?: unknown; max?: unknown };
    if (typeof range.min === "number" && typeof range.max === "number") {
      return `${formatValue(range.min)}–${formatValue(range.max)}`;
    }
    return JSON.stringify(value);
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

/** Versucht Belichtung, Weißabgleich und Fokus festzusetzen. */
export async function lockTrack(track: MediaStreamTrack): Promise<string> {
  const capabilities = capabilitiesOf(track);
  const supportsManual = (key: string) => {
    const modes = capabilities[key];
    return Array.isArray(modes) && modes.includes("manual");
  };

  const advanced: Record<string, string>[] = [];
  const locked: string[] = [];
  if (supportsManual("exposureMode")) {
    advanced.push({ exposureMode: "manual" });
    locked.push("Belichtung");
  }
  if (supportsManual("whiteBalanceMode")) {
    advanced.push({ whiteBalanceMode: "manual" });
    locked.push("Weißabgleich");
  }
  if (supportsManual("focusMode")) {
    advanced.push({ focusMode: "manual" });
    locked.push("Fokus");
  }

  if (!advanced.length) return "Dieses Gerät erlaubt im Browser keine Sperre.";
  try {
    await track.applyConstraints({ advanced } as MediaTrackConstraints);
    return `Gesperrt: ${locked.join(", ")}`;
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

export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = 1.1;
  window.speechSynthesis.speak(utterance);
}
