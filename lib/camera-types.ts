// Gemeinsame Datenformen für die Kamera-Fernbedienung (iPhone ↔ Server ↔ Dashboard).
import type { ColorParams } from "@/lib/detection/color";
import type { Cup, CupState } from "@/lib/detection/detector";
import type { ActiveBlockInfo } from "@/lib/live-types";

export type CameraMode = "calibrate" | "detect";

export interface CameraSettings {
  cups: Cup[];
  radius: number;
  zoom: number;
  threshold: number;
  framesOn: number;
  handThreshold: number;
  color: ColorParams;
  mode: CameraMode;
  voice: boolean;
  sendHits: boolean;
  torch: boolean;
}

export interface CameraStatus {
  running: boolean;
  source: "none" | "camera" | "file";
  fps: number;
  hasReference: boolean;
  zoomRange: { min: number; max: number } | null;
  torchAvailable: boolean;
  readings: CupState[];
  referenceMessage: string | null;
}

export type CameraCommandType = "capture_reference";

export interface CameraCommand {
  id: number;
  type: CameraCommandType;
}

/** Antwort an das iPhone auf seine regelmäßige Meldung. */
export interface CameraSyncResponse {
  block: ActiveBlockInfo | null;
  wantPreview: boolean;
  remote: { version: number; settings: CameraSettings } | null;
  command: CameraCommand | null;
}

/** Antwort an das Dashboard. */
export interface CameraStateResponse {
  /** Millisekunden seit der letzten Meldung des iPhones, null = nie */
  reportAgeMs: number | null;
  status: CameraStatus | null;
  settings: CameraSettings | null;
  preview: string | null;
}

const COLOR_KEYS = [
  "whiteMaxSat",
  "whiteMinVal",
  "orangeHueMin",
  "orangeHueMax",
  "orangeMinSat",
  "orangeMinVal",
  "minChange",
] as const satisfies ReadonlyArray<keyof ColorParams>;

const MAX_CUPS = 20;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Prüft Einstellungen aus dem Netz und gibt eine bereinigte Kopie zurück. */
export function parseCameraSettings(value: unknown): CameraSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;

  const cups = input.cups;
  if (
    !Array.isArray(cups) ||
    cups.length > MAX_CUPS ||
    !cups.every((cup) => typeof cup === "object" && cup !== null && isFiniteNumber(cup.x) && isFiniteNumber(cup.y))
  ) {
    return null;
  }

  const { radius, zoom, threshold, framesOn, handThreshold, mode, voice, sendHits, torch } = input;
  if (![radius, zoom, threshold, framesOn, handThreshold].every(isFiniteNumber)) return null;
  if (mode !== "calibrate" && mode !== "detect") return null;
  if (typeof voice !== "boolean" || typeof sendHits !== "boolean" || typeof torch !== "boolean") return null;

  const color = input.color as Record<string, unknown> | null | undefined;
  if (!color || !COLOR_KEYS.every((key) => isFiniteNumber(color[key]))) return null;

  return {
    cups: (cups as Cup[]).map((cup) => ({ x: clamp01(cup.x), y: clamp01(cup.y) })),
    radius: radius as number,
    zoom: zoom as number,
    threshold: threshold as number,
    framesOn: Math.round(framesOn as number),
    handThreshold: handThreshold as number,
    color: Object.fromEntries(COLOR_KEYS.map((key) => [key, color[key]])) as unknown as ColorParams,
    mode,
    voice,
    sendHits,
    torch,
  };
}
