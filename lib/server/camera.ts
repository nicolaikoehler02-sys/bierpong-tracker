import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { cameraControl } from "@/db/schema";
import type {
  CameraCommandType,
  CameraSettings,
  CameraStateResponse,
  CameraStatus,
  CameraSyncResponse,
} from "@/lib/camera-types";
import { getActiveBlock, touchCamera } from "@/lib/server/blocks";

const CAMERA_ID = "main";
/** Nur solange das Dashboard in den letzten Sekunden hingeschaut hat, schickt das iPhone Vorschaubilder. */
const VIEWER_WINDOW_MS = 10_000;

/** Meldung vom iPhone: Status und Einstellungen speichern, Befehle und Wunsch-Einstellungen zurückgeben. */
export async function syncCamera(input: {
  cameraRunning: boolean;
  status: CameraStatus;
  settings: CameraSettings;
  preview: string | null;
}): Promise<CameraSyncResponse> {
  const now = new Date();
  const update = {
    status: input.status,
    settings: input.settings,
    reportedAt: now,
    ...(input.preview ? { preview: input.preview, previewAt: now } : {}),
  };

  const [row] = await getDb()
    .insert(cameraControl)
    .values({ id: CAMERA_ID, ...update })
    .onConflictDoUpdate({ target: cameraControl.id, set: update })
    .returning({
      remoteSettings: cameraControl.remoteSettings,
      remoteVersion: cameraControl.remoteVersion,
      command: cameraControl.command,
      viewerSeenAt: cameraControl.viewerSeenAt,
    });

  const block = await getActiveBlock();
  if (block && input.cameraRunning) await touchCamera(block.id);

  return {
    block: block
      ? {
          id: block.id,
          drillId: block.drillId,
          playerName: block.playerName,
          plannedVolume: block.plannedVolume,
          formation: block.formation,
        }
      : null,
    wantPreview: row.viewerSeenAt !== null && now.getTime() - row.viewerSeenAt.getTime() < VIEWER_WINDOW_MS,
    remote:
      row.remoteVersion > 0 && row.remoteSettings
        ? { version: row.remoteVersion, settings: row.remoteSettings }
        : null,
    command: row.command ?? null,
  };
}

/** Kamera-Zustand für das Dashboard; merkt sich dabei, dass jemand zuschaut. */
export async function readCameraState(): Promise<CameraStateResponse> {
  const now = new Date();
  const [row] = await getDb()
    .update(cameraControl)
    .set({ viewerSeenAt: now })
    .where(eq(cameraControl.id, CAMERA_ID))
    .returning({
      status: cameraControl.status,
      settings: cameraControl.settings,
      preview: cameraControl.preview,
      reportedAt: cameraControl.reportedAt,
    });

  if (!row) return { reportAgeMs: null, status: null, settings: null, preview: null };
  return {
    reportAgeMs: row.reportedAt ? now.getTime() - row.reportedAt.getTime() : null,
    status: row.status,
    settings: row.settings,
    preview: row.preview,
  };
}

export async function setRemoteSettings(settings: CameraSettings): Promise<void> {
  const update = { remoteSettings: settings, remoteVersion: Date.now() };
  await getDb()
    .insert(cameraControl)
    .values({ id: CAMERA_ID, ...update })
    .onConflictDoUpdate({ target: cameraControl.id, set: update });
}

export async function setCameraCommand(type: CameraCommandType): Promise<void> {
  const update = { command: { id: Date.now(), type } };
  await getDb()
    .insert(cameraControl)
    .values({ id: CAMERA_ID, ...update })
    .onConflictDoUpdate({ target: cameraControl.id, set: update });
}
