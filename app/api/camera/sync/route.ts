import { parseCameraSettings } from "@/lib/camera-types";
import type { CameraStatus } from "@/lib/camera-types";
import { syncCamera } from "@/lib/server/camera";

const MAX_PREVIEW_LENGTH = 400_000;
const MAX_STATUS_LENGTH = 20_000;

/** Regelmäßige Meldung der Kamera-Seite (ca. alle 1,5 s). */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Ungültige Daten" }, { status: 400 });

  const settings = parseCameraSettings(body.settings);
  const status = body.status as CameraStatus | undefined;
  if (!settings || typeof status !== "object" || status === null || JSON.stringify(status).length > MAX_STATUS_LENGTH) {
    return Response.json({ error: "Ungültige Daten" }, { status: 400 });
  }

  const preview =
    typeof body.preview === "string" &&
    body.preview.startsWith("data:image/jpeg;base64,") &&
    body.preview.length <= MAX_PREVIEW_LENGTH
      ? body.preview
      : null;

  const response = await syncCamera({ cameraRunning: body.camera === true, status, settings, preview });
  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
