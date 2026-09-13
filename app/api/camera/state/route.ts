import { readCameraState } from "@/lib/server/camera";

/** Kamera-Zustand und Vorschaubild für das Dashboard. */
export async function GET() {
  return Response.json(await readCameraState(), { headers: { "Cache-Control": "no-store" } });
}
