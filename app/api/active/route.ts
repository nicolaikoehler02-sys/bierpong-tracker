import type { NextRequest } from "next/server";
import { getActiveBlock, touchCamera } from "@/lib/server/blocks";

/** Aktiver Drill-Block für die Kamera-Seite. Mit ?camera=1 meldet sich die Kamera als verbunden. */
export async function GET(request: NextRequest) {
  const block = await getActiveBlock();
  if (block && request.nextUrl.searchParams.get("camera") === "1") await touchCamera(block.id);

  return Response.json(
    {
      block: block
        ? {
            id: block.id,
            drillId: block.drillId,
            playerName: block.playerName,
            plannedVolume: block.plannedVolume,
            formation: block.formation,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
