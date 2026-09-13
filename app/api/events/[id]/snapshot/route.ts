import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { events } from "@/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Standbild eines Treffers als JPEG. Ändert sich nie, darf also lange gecacht werden. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/events/[id]/snapshot">) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response(null, { status: 400 });

  const [row] = await getDb().select({ snapshot: events.snapshotUrl }).from(events).where(eq(events.id, id)).limit(1);
  const base64 = row?.snapshot?.startsWith("data:image/jpeg;base64,") ? row.snapshot.slice(23) : null;
  if (!base64) return new Response(null, { status: 404 });

  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
