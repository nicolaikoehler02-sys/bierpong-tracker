import type { NextRequest } from "next/server";
import { getBlockEvents } from "@/lib/server/blocks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Alle Ereignisse eines Blocks (ohne Bilddaten), z. B. für „Treffer prüfen“. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/blocks/[id]/events">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Ungültige ID" }, { status: 400 });
  return Response.json({ events: await getBlockEvents(id) }, { headers: { "Cache-Control": "no-store" } });
}
