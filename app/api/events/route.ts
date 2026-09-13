import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { type BallColor, drillBlocks, events } from "@/db/schema";
import type { NewEventBody } from "@/lib/live-types";

const KINDS = new Set(["hit", "miss", "catch"]);
const SOURCES = new Set(["camera", "tap"]);
const COLORS = new Set<BallColor>(["weiss", "orange"]);

function parseBody(value: unknown): NewEventBody | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.blockId !== "string" || !KINDS.has(body.kind as string) || !SOURCES.has(body.source as string)) {
    return null;
  }
  const cup = body.cup;
  const ballColor = body.ballColor;
  const confidence = body.confidence;
  return {
    blockId: body.blockId,
    kind: body.kind as NewEventBody["kind"],
    source: body.source as NewEventBody["source"],
    cup: Number.isInteger(cup) && (cup as number) >= 0 ? (cup as number) : null,
    ballColor: COLORS.has(ballColor as BallColor) ? (ballColor as BallColor) : null,
    confidence: typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null,
  };
}

/** Neues Ereignis zum aktiven Block, z. B. ein von der Kamera erkannter Treffer. */
export async function POST(request: Request) {
  const body = parseBody(await request.json().catch(() => null));
  if (!body) return Response.json({ error: "Ungültige Daten" }, { status: 400 });

  const db = getDb();
  const [block] = await db
    .select({ id: drillBlocks.id })
    .from(drillBlocks)
    .where(and(eq(drillBlocks.id, body.blockId), isNull(drillBlocks.endedAt)))
    .limit(1);
  if (!block) return Response.json({ error: "Kein aktiver Block" }, { status: 409 });

  const [created] = await db
    .insert(events)
    .values({
      blockId: body.blockId,
      kind: body.kind,
      source: body.source,
      cup: body.cup,
      ballColor: body.ballColor,
      confidence: body.confidence,
    })
    .returning({ id: events.id });

  return Response.json({ id: created.id }, { status: 201 });
}
