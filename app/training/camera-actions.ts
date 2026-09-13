"use server";

import { type CameraCommandType, parseCameraSettings } from "@/lib/camera-types";
import type { ActionResult } from "@/lib/live-types";
import { setCameraCommand, setRemoteSettings } from "@/lib/server/camera";

export async function sendRemoteSettings(settings: unknown): Promise<ActionResult> {
  const parsed = parseCameraSettings(settings);
  if (!parsed) return { ok: false, error: "Ungültige Kamera-Einstellungen." };
  await setRemoteSettings(parsed);
  return { ok: true };
}

export async function sendCameraCommand(type: CameraCommandType): Promise<ActionResult> {
  if (type !== "capture_reference") return { ok: false, error: "Unbekannter Befehl." };
  await setCameraCommand(type);
  return { ok: true };
}
